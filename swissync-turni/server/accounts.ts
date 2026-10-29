import { decryptText, encryptText, hashPassword, hmacHex, randomCode, randomToken, sha256Hex, signEs256Jwt, verifyIdToken, verifyPassword } from './crypto';
import { accountsEnabled, type Db, type ServerEnv } from './env';
import { bearer, clientIp, corsHeaders, json, readJson } from './http';
import { codeEmail, sendMail } from './mail';

/**
 * Swissync Turni accounts: e-mail + password with e-mail codes, Sign in with Apple and Google,
 * the synced copy of the app data, and the monthly xAI allowance. Runs in a Cloudflare Worker
 * on D1 (and on SQLite in development and tests).
 */

export interface UserRow {
  id: string;
  email: string | null;
  email_verified: number;
  password_hash: string | null;
  name: string;
  locale: string;
  created_at: number;
  updated_at: number;
}

const DAY = 86_400_000;
const SESSION_DAYS = 180;
const CODE_TTL = 15 * 60_000;
const MAX_STATE = 1_900_000;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

const db = (env: ServerEnv): Db => env.DB as Db;
const now = () => Date.now();
const normEmail = (e: unknown) => (typeof e === 'string' ? e.trim().toLowerCase() : '');
const okPassword = (p: unknown): p is string => typeof p === 'string' && p.length >= 8 && p.length <= 200;
const month = (t = now()) => new Date(t).toISOString().slice(0, 7);
const LOCALES = new Set(['it', 'en', 'de', 'fr']);
const pickLocale = (l: unknown) => (typeof l === 'string' && LOCALES.has(l.slice(0, 2)) ? l.slice(0, 2) : 'it');

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

async function tokenHash(env: ServerEnv, token: string) {
  return hmacHex(env.TOKEN_SECRET!, `session:${token}`);
}

async function createSession(env: ServerEnv, userId: string): Promise<string> {
  const token = randomToken(32);
  const t = now();
  await db(env)
    .prepare('INSERT INTO sessions (token_hash, user_id, created_at, last_used_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(await tokenHash(env, token), userId, t, t, t + SESSION_DAYS * DAY)
    .run();
  return token;
}

/** The account behind a request's bearer token (sessions slide while in use). */
export async function userFromRequest(request: Request, env: ServerEnv): Promise<UserRow | null> {
  if (!accountsEnabled(env)) return null;
  const token = bearer(request);
  if (!token || token.length > 200) return null;
  const hash = await tokenHash(env, token);
  const row = await db(env)
    .prepare('SELECT u.*, s.last_used_at AS s_used FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?')
    .bind(hash, now())
    .first<UserRow & { s_used: number }>();
  if (!row) return null;
  if (now() - row.s_used > DAY) {
    await db(env).prepare('UPDATE sessions SET last_used_at = ?, expires_at = ? WHERE token_hash = ?').bind(now(), now() + SESSION_DAYS * DAY, hash).run();
  }
  return row;
}

async function providersOf(env: ServerEnv, user: UserRow): Promise<string[]> {
  const { results } = await db(env).prepare('SELECT provider FROM identities WHERE user_id = ?').bind(user.id).all<{ provider: string }>();
  return [...(user.password_hash ? ['email'] : []), ...results.map((r) => r.provider)];
}

async function publicUser(env: ServerEnv, user: UserRow) {
  return { id: user.id, email: user.email ?? '', name: user.name, providers: await providersOf(env, user) };
}

async function signedIn(env: ServerEnv, user: UserRow, cors: Record<string, string>) {
  const token = await createSession(env, user.id);
  return json(200, { ok: true, token, user: await publicUser(env, user), quota: await aiUsage(env, user.id) }, cors);
}

// ---------------------------------------------------------------------------
// Abuse guards and e-mail codes
// ---------------------------------------------------------------------------

/** Counts an attempt; true when the key is over its limit in the window. */
async function throttled(env: ServerEnv, key: string, limit: number, windowMs: number): Promise<boolean> {
  const t = now();
  const row = await db(env)
    .prepare(
      `INSERT INTO throttle (key, count, window_start) VALUES (?, 1, ?)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN window_start < ? THEN 1 ELSE count + 1 END,
         window_start = CASE WHEN window_start < ? THEN ? ELSE window_start END
       RETURNING count`,
    )
    .bind(key, t, t - windowMs, t - windowMs, t)
    .first<{ count: number }>();
  return (row?.count ?? 0) > limit;
}

async function codeHash(env: ServerEnv, email: string, purpose: string, code: string) {
  return hmacHex(env.TOKEN_SECRET!, `code:${purpose}:${email}:${code}`);
}

/** Sends a 6-digit code by e-mail. In development it can be returned instead (AUTH_DEBUG_CODES). */
async function issueCode(env: ServerEnv, email: string, purpose: 'verify' | 'reset', locale: string): Promise<{ sent: boolean; debugCode?: string }> {
  const code = randomCode();
  const t = now();
  await db(env)
    .prepare(
      `INSERT INTO email_codes (email, purpose, code_hash, attempts, expires_at, created_at) VALUES (?, ?, ?, 0, ?, ?)
       ON CONFLICT (email, purpose) DO UPDATE SET code_hash = excluded.code_hash, attempts = 0, expires_at = excluded.expires_at, created_at = excluded.created_at`,
    )
    .bind(email, purpose, await codeHash(env, email, purpose, code), t + CODE_TTL, t)
    .run();
  if (env.AUTH_DEBUG_CODES === '1') return { sent: true, debugCode: code };
  return { sent: await sendMail(env, email, codeEmail(code, purpose, locale)) };
}

async function checkCode(env: ServerEnv, email: string, purpose: string, code: unknown): Promise<true | string> {
  const row = await db(env).prepare('SELECT code_hash, attempts, expires_at FROM email_codes WHERE email = ? AND purpose = ?').bind(email, purpose).first<{ code_hash: string; attempts: number; expires_at: number }>();
  if (!row || row.expires_at < now()) return 'code_expired';
  if (row.attempts >= 5) return 'too_many_attempts';
  const given = typeof code === 'string' ? code.replace(/\D/g, '') : '';
  if (given.length !== 6 || (await codeHash(env, email, purpose, given)) !== row.code_hash) {
    await db(env).prepare('UPDATE email_codes SET attempts = attempts + 1 WHERE email = ? AND purpose = ?').bind(email, purpose).run();
    return 'invalid_code';
  }
  await db(env).prepare('DELETE FROM email_codes WHERE email = ? AND purpose = ?').bind(email, purpose).run();
  return true;
}

async function userByEmail(env: ServerEnv, email: string) {
  return db(env).prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
}

async function createUser(env: ServerEnv, fields: { email: string | null; verified: boolean; passwordHash: string | null; name: string; locale: string }): Promise<UserRow> {
  const t = now();
  const user: UserRow = { id: crypto.randomUUID(), email: fields.email, email_verified: fields.verified ? 1 : 0, password_hash: fields.passwordHash, name: fields.name.slice(0, 120), locale: fields.locale, created_at: t, updated_at: t };
  await db(env)
    .prepare('INSERT INTO users (id, email, email_verified, password_hash, name, locale, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(user.id, user.email, user.email_verified, user.password_hash, user.name, user.locale, t, t)
    .run();
  return user;
}

// ---------------------------------------------------------------------------
// Sign in with Apple / Google
// ---------------------------------------------------------------------------

const list = (s?: string) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);

async function appleClientSecret(env: ServerEnv, clientId: string): Promise<string> {
  const iat = Math.floor(now() / 1000);
  return signEs256Jwt({ kid: env.APPLE_KEY_ID }, { iss: env.APPLE_TEAM_ID, iat, exp: iat + 300, aud: 'https://appleid.apple.com', sub: clientId }, env.APPLE_PRIVATE_KEY!);
}

const appleKeyConfigured = (env: ServerEnv) => !!(env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY);

/** Exchanges Apple's one-time code and keeps the (encrypted) refresh token, to revoke it later. */
async function storeAppleToken(env: ServerEnv, userId: string, code: string, clientId: string): Promise<void> {
  if (!appleKeyConfigured(env) || !list(env.APPLE_CLIENT_IDS).includes(clientId)) return;
  const res = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: await appleClientSecret(env, clientId), code, grant_type: 'authorization_code' }),
  });
  if (!res.ok) return;
  const { refresh_token } = (await res.json()) as { refresh_token?: string };
  if (!refresh_token) return;
  await db(env)
    .prepare(
      `INSERT INTO apple_tokens (user_id, client_id, refresh_token_enc, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, client_id) DO UPDATE SET refresh_token_enc = excluded.refresh_token_enc, created_at = excluded.created_at`,
    )
    .bind(userId, clientId, await encryptText(env.TOKEN_SECRET!, refresh_token), now())
    .run();
}

async function revokeAppleTokens(env: ServerEnv, userId: string): Promise<void> {
  if (!appleKeyConfigured(env)) return;
  const { results } = await db(env).prepare('SELECT client_id, refresh_token_enc FROM apple_tokens WHERE user_id = ?').bind(userId).all<{ client_id: string; refresh_token_enc: string }>();
  for (const row of results) {
    try {
      const token = await decryptText(env.TOKEN_SECRET!, row.refresh_token_enc);
      await fetch('https://appleid.apple.com/auth/revoke', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: row.client_id, client_secret: await appleClientSecret(env, row.client_id), token, token_type_hint: 'refresh_token' }),
      });
    } catch {
      // Best effort: the account is deleted anyway.
    }
  }
}

const PROVIDERS = {
  google: { jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs', issuers: ['https://accounts.google.com', 'accounts.google.com'], audiences: (env: ServerEnv) => list(env.GOOGLE_CLIENT_IDS) },
  apple: { jwksUrl: 'https://appleid.apple.com/auth/keys', issuers: ['https://appleid.apple.com'], audiences: (env: ServerEnv) => list(env.APPLE_CLIENT_IDS) },
} as const;

type Provider = keyof typeof PROVIDERS;

async function oauthSignIn(env: ServerEnv, body: Record<string, unknown>, cors: Record<string, string>): Promise<Response> {
  const provider = body.provider as Provider;
  const spec = PROVIDERS[provider];
  if (!spec || typeof body.idToken !== 'string' || typeof body.nonce !== 'string') return json(400, { ok: false, error: 'bad_request' }, cors);
  const audiences = spec.audiences(env);
  if (!audiences.length) return json(503, { ok: false, error: 'provider_not_configured' }, cors);
  let claims: Record<string, unknown>;
  try {
    claims = await verifyIdToken(body.idToken, { jwksUrl: spec.jwksUrl, issuers: [...spec.issuers], audiences });
  } catch {
    return json(401, { ok: false, error: 'auth_failed' }, cors);
  }
  // The provider signed a hash of the nonce the app generated for this sign-in.
  if (claims.nonce !== (await sha256Hex(body.nonce))) return json(401, { ok: false, error: 'auth_failed' }, cors);
  const subject = String(claims.sub ?? '');
  if (!subject) return json(401, { ok: false, error: 'auth_failed' }, cors);
  const email = normEmail(claims.email);
  const emailVerified = claims.email_verified === true || claims.email_verified === 'true';
  const name = typeof body.name === 'string' ? body.name.trim() : typeof claims.name === 'string' ? claims.name : '';

  const linked = await db(env).prepare('SELECT u.* FROM identities i JOIN users u ON u.id = i.user_id WHERE i.provider = ? AND i.subject = ?').bind(provider, subject).first<UserRow>();
  let user = linked;
  if (!user && email && emailVerified) {
    user = await userByEmail(env, email);
    if (user && !user.email_verified) {
      // A never-confirmed sign-up with this address: the provider proves ownership now, and the
      // unconfirmed password (possibly set by someone else) is dropped.
      await db(env).prepare('UPDATE users SET email_verified = 1, password_hash = NULL, updated_at = ? WHERE id = ?').bind(now(), user.id).run();
      user = { ...user, email_verified: 1, password_hash: null };
    }
  }
  if (!user) user = await createUser(env, { email: email && emailVerified ? email : null, verified: emailVerified, passwordHash: null, name, locale: pickLocale(body.locale) });
  if (!linked) {
    await db(env).prepare('INSERT OR IGNORE INTO identities (provider, subject, user_id, email, created_at) VALUES (?, ?, ?, ?, ?)').bind(provider, subject, user.id, email || null, now()).run();
  }
  if (name && !user.name) {
    await db(env).prepare('UPDATE users SET name = ?, updated_at = ? WHERE id = ?').bind(name.slice(0, 120), now(), user.id).run();
    user = { ...user, name: name.slice(0, 120) };
  }
  if (provider === 'apple' && typeof body.appleCode === 'string' && body.appleCode.length < 2000) {
    await storeAppleToken(env, user.id, body.appleCode, typeof body.clientId === 'string' ? body.clientId : list(env.APPLE_CLIENT_IDS)[0] ?? '').catch(() => undefined);
  }
  return signedIn(env, user, cors);
}

// ---------------------------------------------------------------------------
// xAI allowance
// ---------------------------------------------------------------------------

export const aiLimit = (env: ServerEnv) => Math.max(0, Number(env.AI_MONTHLY_LIMIT ?? 6) || 0);

export async function aiUsage(env: ServerEnv, userId: string): Promise<{ used: number; limit: number }> {
  const row = await db(env).prepare('SELECT used FROM ai_usage WHERE user_id = ? AND month = ?').bind(userId, month()).first<{ used: number }>();
  return { used: row?.used ?? 0, limit: aiLimit(env) };
}

/** Takes one analysis from this month's allowance (atomically). */
export async function consumeAi(env: ServerEnv, userId: string): Promise<{ allowed: boolean; used: number; limit: number }> {
  const limit = aiLimit(env);
  const row = await db(env)
    .prepare(
      `INSERT INTO ai_usage (user_id, month, used) SELECT ?, ?, 1 WHERE ? > 0
       ON CONFLICT (user_id, month) DO UPDATE SET used = used + 1 WHERE used < ?
       RETURNING used`,
    )
    .bind(userId, month(), limit, limit)
    .first<{ used: number }>();
  if (row) return { allowed: true, used: row.used, limit };
  return { allowed: false, ...(await aiUsage(env, userId)) };
}

export async function refundAi(env: ServerEnv, userId: string): Promise<void> {
  await db(env).prepare('UPDATE ai_usage SET used = MAX(used - 1, 0) WHERE user_id = ? AND month = ?').bind(userId, month()).run().catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/** Public settings the app needs (which sign-in buttons to show). */
export function authConfig(env: ServerEnv) {
  return {
    accounts: accountsEnabled(env),
    aiMonthlyLimit: aiLimit(env),
    google: env.GOOGLE_WEB_CLIENT_ID ? { webClientId: env.GOOGLE_WEB_CLIENT_ID, iosClientId: env.GOOGLE_IOS_CLIENT_ID ?? '' } : null,
    apple: list(env.APPLE_CLIENT_IDS).length ? { servicesId: env.APPLE_SERVICES_ID ?? '' } : null,
  };
}

export async function handleAuth(request: Request, env: ServerEnv, action: string): Promise<Response> {
  const { allow, headers: cors } = corsHeaders(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: allow ? 204 : 403, headers: cors });
  if (request.headers.get('origin') && !allow) return json(403, { ok: false, error: 'origin_not_allowed' }, cors);
  if (action === 'config') return json(200, { ok: true, ...authConfig(env) }, cors);
  if (!accountsEnabled(env)) return json(503, { ok: false, error: 'accounts_not_configured' }, cors);

  if (action === 'me' && request.method === 'GET') {
    const user = await userFromRequest(request, env);
    if (!user) return json(401, { ok: false, error: 'auth_required' }, cors);
    return json(200, { ok: true, user: await publicUser(env, user), quota: await aiUsage(env, user.id) }, cors);
  }
  if (request.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' }, cors);
  const body = await readJson<Record<string, unknown>>(request, 20_000);
  if (!body) return json(400, { ok: false, error: 'bad_request' }, cors);
  const ip = clientIp(request);
  if (await throttled(env, `ip:${ip}`, 60, 10 * 60_000)) return json(429, { ok: false, error: 'too_many_requests' }, cors);
  const email = normEmail(body.email);
  const locale = pickLocale(body.locale);

  switch (action) {
    case 'signup': {
      if (!EMAIL_RE.test(email)) return json(400, { ok: false, error: 'invalid_email' }, cors);
      if (!okPassword(body.password)) return json(400, { ok: false, error: 'weak_password' }, cors);
      if (await throttled(env, `mail:${email}`, 5, 60 * 60_000)) return json(429, { ok: false, error: 'too_many_requests' }, cors);
      const existing = await userByEmail(env, email);
      if (existing?.email_verified) return json(409, { ok: false, error: 'already_registered' }, cors);
      const passwordHash = await hashPassword(body.password);
      if (existing) await db(env).prepare('UPDATE users SET password_hash = ?, locale = ?, updated_at = ? WHERE id = ?').bind(passwordHash, locale, now(), existing.id).run();
      else await createUser(env, { email, verified: false, passwordHash, name: typeof body.name === 'string' ? body.name.trim() : '', locale });
      const sent = await issueCode(env, email, 'verify', locale);
      return json(200, { ok: true, verify: true, ...(sent.debugCode ? { debugCode: sent.debugCode } : {}), ...(sent.sent ? {} : { error: 'mail_failed' }) }, cors);
    }
    case 'resend': {
      const purpose = body.purpose === 'reset' ? 'reset' : 'verify';
      if (await throttled(env, `mail:${email}`, 5, 60 * 60_000)) return json(429, { ok: false, error: 'too_many_requests' }, cors);
      const user = EMAIL_RE.test(email) ? await userByEmail(env, email) : null;
      // Same answer whether or not the address has an account.
      if (user && (purpose === 'reset' || !user.email_verified)) {
        const sent = await issueCode(env, email, purpose, user.locale || locale);
        return json(200, { ok: true, ...(sent.debugCode ? { debugCode: sent.debugCode } : {}) }, cors);
      }
      return json(200, { ok: true }, cors);
    }
    case 'verify': {
      const user = await userByEmail(env, email);
      if (!user) return json(400, { ok: false, error: 'invalid_code' }, cors);
      const check = await checkCode(env, email, 'verify', body.code);
      if (check !== true) return json(400, { ok: false, error: check }, cors);
      await db(env).prepare('UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?').bind(now(), user.id).run();
      return signedIn(env, { ...user, email_verified: 1 }, cors);
    }
    case 'login': {
      if (await throttled(env, `login:${email}`, 10, 15 * 60_000)) return json(429, { ok: false, error: 'too_many_requests' }, cors);
      const user = EMAIL_RE.test(email) ? await userByEmail(env, email) : null;
      const valid = await verifyPassword(typeof body.password === 'string' ? body.password : '', user?.password_hash);
      if (!user || !valid) return json(401, { ok: false, error: 'invalid_credentials' }, cors);
      if (!user.email_verified) {
        const sent = await issueCode(env, email, 'verify', user.locale || locale);
        return json(403, { ok: false, error: 'email_not_confirmed', ...(sent.debugCode ? { debugCode: sent.debugCode } : {}) }, cors);
      }
      return signedIn(env, user, cors);
    }
    case 'reset-request': {
      if (await throttled(env, `mail:${email}`, 5, 60 * 60_000)) return json(429, { ok: false, error: 'too_many_requests' }, cors);
      const user = EMAIL_RE.test(email) ? await userByEmail(env, email) : null;
      if (user) {
        const sent = await issueCode(env, email, 'reset', user.locale || locale);
        if (sent.debugCode) return json(200, { ok: true, debugCode: sent.debugCode }, cors);
      }
      return json(200, { ok: true }, cors);
    }
    case 'reset-confirm': {
      if (!okPassword(body.password)) return json(400, { ok: false, error: 'weak_password' }, cors);
      const user = await userByEmail(env, email);
      if (!user) return json(400, { ok: false, error: 'invalid_code' }, cors);
      const check = await checkCode(env, email, 'reset', body.code);
      if (check !== true) return json(400, { ok: false, error: check }, cors);
      // A new password signs out every other device.
      await db(env).prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run();
      await db(env).prepare('UPDATE users SET password_hash = ?, email_verified = 1, updated_at = ? WHERE id = ?').bind(await hashPassword(body.password), now(), user.id).run();
      return signedIn(env, { ...user, email_verified: 1 }, cors);
    }
    case 'oauth':
      return oauthSignIn(env, body, cors);
    case 'logout': {
      const token = bearer(request);
      if (token) await db(env).prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await tokenHash(env, token)).run();
      return json(200, { ok: true }, cors);
    }
    case 'delete': {
      const user = await userFromRequest(request, env);
      if (!user) return json(401, { ok: false, error: 'auth_required' }, cors);
      await revokeAppleTokens(env, user.id);
      for (const table of ['apple_tokens', 'ai_usage', 'app_state', 'sessions', 'identities']) {
        await db(env).prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(user.id).run();
      }
      if (user.email) await db(env).prepare('DELETE FROM email_codes WHERE email = ?').bind(user.email).run();
      await db(env).prepare('DELETE FROM users WHERE id = ?').bind(user.id).run();
      return json(200, { ok: true }, cors);
    }
    default:
      return json(404, { ok: false, error: 'not_found' }, cors);
  }
}

/** The account's copy of the app data, with optimistic concurrency (version). */
export async function handleSync(request: Request, env: ServerEnv): Promise<Response> {
  const { allow, headers: cors } = corsHeaders(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: allow ? 204 : 403, headers: cors });
  if (request.headers.get('origin') && !allow) return json(403, { ok: false, error: 'origin_not_allowed' }, cors);
  if (!accountsEnabled(env)) return json(503, { ok: false, error: 'accounts_not_configured' }, cors);
  const user = await userFromRequest(request, env);
  if (!user) return json(401, { ok: false, error: 'auth_required' }, cors);

  if (request.method === 'GET') {
    const row = await db(env).prepare('SELECT data, version FROM app_state WHERE user_id = ?').bind(user.id).first<{ data: string; version: number }>();
    return json(200, { ok: true, data: row ? JSON.parse(row.data) : null, version: row?.version ?? 0 }, cors);
  }
  if (request.method !== 'PUT') return json(405, { ok: false, error: 'method_not_allowed' }, cors);
  const raw = await request.text();
  if (raw.length > MAX_STATE + 1000) return json(413, { ok: false, error: 'too_large' }, cors);
  let body: { data?: unknown; base?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { ok: false, error: 'bad_request' }, cors);
  }
  if (!body.data || typeof body.data !== 'object' || typeof body.base !== 'number') return json(400, { ok: false, error: 'bad_request' }, cors);
  const data = JSON.stringify(body.data);
  if (data.length > MAX_STATE) return json(413, { ok: false, error: 'too_large' }, cors);
  const t = now();
  const res =
    body.base === 0
      ? await db(env).prepare('INSERT INTO app_state (user_id, data, version, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT (user_id) DO NOTHING').bind(user.id, data, t).run()
      : await db(env).prepare('UPDATE app_state SET data = ?, version = version + 1, updated_at = ? WHERE user_id = ? AND version = ?').bind(data, t, user.id, body.base).run();
  if (!res.meta.changes) return json(409, { ok: false, error: 'conflict' }, cors);
  return json(200, { ok: true, version: body.base + 1 }, cors);
}
