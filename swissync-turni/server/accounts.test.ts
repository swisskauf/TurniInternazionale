import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleApi } from './api';
import { b64url, sha256Hex, signEs256Jwt } from './crypto';
import type { ServerEnv } from './env';
import { sqliteDb } from './sqlite';

const env = (): ServerEnv => ({
  TOKEN_SECRET: 'test-secret',
  AUTH_DEBUG_CODES: '1',
  DB: sqliteDb(':memory:', 'migrations'),
  GOOGLE_CLIENT_IDS: 'web-client.apps.googleusercontent.com,ios-client.apps.googleusercontent.com',
  GOOGLE_WEB_CLIENT_ID: 'web-client.apps.googleusercontent.com',
  APPLE_CLIENT_IDS: 'org.swissync.turni',
});

async function api(e: ServerEnv, path: string, body?: unknown, token?: string, method = body === undefined ? 'GET' : 'POST') {
  const res = await handleApi(
    new Request(`https://turni.swissync.org${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '7.7.7.7', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    e,
  );
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

afterEach(() => vi.unstubAllGlobals());

describe('accounts: e-mail and password', () => {
  it('signs up with a code, then signs in', async () => {
    const e = env();
    const up = await api(e, '/api/auth/signup', { email: 'Anna@Example.ch', password: 'password123', locale: 'it' });
    expect(up.body).toMatchObject({ ok: true, verify: true });
    // Not confirmed yet: no session, a new code instead.
    const early = await api(e, '/api/auth/login', { email: 'anna@example.ch', password: 'password123' });
    expect(early.body.error).toBe('email_not_confirmed');
    expect((await api(e, '/api/auth/verify', { email: 'anna@example.ch', code: '000000' })).body.error).toMatch(/invalid_code/);
    const done = await api(e, '/api/auth/verify', { email: 'anna@example.ch', code: early.body.debugCode });
    expect(done.body).toMatchObject({ ok: true, user: { email: 'anna@example.ch', providers: ['email'] }, quota: { used: 0, limit: 6 } });
    expect((await api(e, '/api/auth/me', undefined, done.body.token)).body.user.email).toBe('anna@example.ch');
    expect((await api(e, '/api/auth/login', { email: 'anna@example.ch', password: 'wrong-password' })).body.error).toBe('invalid_credentials');
    const login = await api(e, '/api/auth/login', { email: 'ANNA@example.ch', password: 'password123' });
    expect(login.body.ok).toBe(true);
    expect((await api(e, '/api/auth/signup', { email: 'anna@example.ch', password: 'another123' })).body.error).toBe('already_registered');
  });

  it('resets the password with a code and signs out the other devices', async () => {
    const e = env();
    const up = await api(e, '/api/auth/signup', { email: 'luca@example.ch', password: 'password123' });
    const first = await api(e, '/api/auth/verify', { email: 'luca@example.ch', code: up.body.debugCode });
    const req = await api(e, '/api/auth/reset-request', { email: 'luca@example.ch' });
    expect((await api(e, '/api/auth/reset-request', { email: 'nobody@example.ch' })).body).toEqual({ ok: true });
    const reset = await api(e, '/api/auth/reset-confirm', { email: 'luca@example.ch', code: req.body.debugCode, password: 'new-password-1' });
    expect(reset.body.ok).toBe(true);
    expect((await api(e, '/api/auth/me', undefined, first.body.token)).status).toBe(401);
    expect((await api(e, '/api/auth/login', { email: 'luca@example.ch', password: 'new-password-1' })).body.ok).toBe(true);
  });

  it('limits wrong codes', async () => {
    const e = env();
    await api(e, '/api/auth/signup', { email: 'sara@example.ch', password: 'password123' });
    for (let i = 0; i < 5; i++) await api(e, '/api/auth/verify', { email: 'sara@example.ch', code: '111111' });
    expect((await api(e, '/api/auth/verify', { email: 'sara@example.ch', code: '111111' })).body.error).toBe('too_many_attempts');
  });
});

describe('accounts: Google and Apple', async () => {
  const keys = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const jwk = { ...(await crypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  const enc = new TextEncoder();

  async function idToken(claims: Record<string, unknown>) {
    const head = b64url(enc.encode(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' })));
    const body = b64url(enc.encode(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 600, iat: Math.floor(Date.now() / 1000), ...claims })));
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, enc.encode(`${head}.${body}`));
    return `${head}.${body}.${b64url(sig)}`;
  }

  function providerKeys() {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ keys: [jwk] }), { status: 200 })));
  }

  it('signs in with Google and links the same verified e-mail', async () => {
    providerKeys();
    const e = env();
    const up = await api(e, '/api/auth/signup', { email: 'marco@example.ch', password: 'password123' });
    await api(e, '/api/auth/verify', { email: 'marco@example.ch', code: up.body.debugCode });
    const nonce = 'raw-nonce-1';
    const token = await idToken({ iss: 'https://accounts.google.com', aud: 'ios-client.apps.googleusercontent.com', sub: 'g-123', email: 'marco@example.ch', email_verified: true, nonce: await sha256Hex(nonce), name: 'Marco' });
    const res = await api(e, '/api/auth/oauth', { provider: 'google', idToken: token, nonce });
    expect(res.body).toMatchObject({ ok: true, user: { email: 'marco@example.ch', providers: ['email', 'google'] } });
    // A replayed token with another nonce, or for another app, is refused.
    expect((await api(e, '/api/auth/oauth', { provider: 'google', idToken: token, nonce: 'other' })).status).toBe(401);
    const foreign = await idToken({ iss: 'https://accounts.google.com', aud: 'someone-else', sub: 'g-9', nonce: await sha256Hex(nonce) });
    expect((await api(e, '/api/auth/oauth', { provider: 'google', idToken: foreign, nonce })).status).toBe(401);
  });

  it('creates an account with Sign in with Apple (private relay e-mail)', async () => {
    providerKeys();
    const e = env();
    const nonce = 'apple-nonce';
    const token = await idToken({ iss: 'https://appleid.apple.com', aud: 'org.swissync.turni', sub: 'a-001', email: 'x1y2@privaterelay.appleid.com', email_verified: 'true', nonce: await sha256Hex(nonce) });
    const res = await api(e, '/api/auth/oauth', { provider: 'apple', idToken: token, nonce, name: 'Kati' });
    expect(res.body).toMatchObject({ ok: true, user: { name: 'Kati', providers: ['apple'] } });
    const again = await api(e, '/api/auth/oauth', { provider: 'apple', idToken: token, nonce });
    expect(again.body.user.id).toBe(res.body.user.id);
  });

  it('takes over a never-confirmed sign-up without keeping its password', async () => {
    providerKeys();
    const e = env();
    await api(e, '/api/auth/signup', { email: 'victim@example.ch', password: 'attacker-pass' });
    const nonce = 'n';
    const token = await idToken({ iss: 'https://accounts.google.com', aud: 'web-client.apps.googleusercontent.com', sub: 'g-v', email: 'victim@example.ch', email_verified: true, nonce: await sha256Hex(nonce) });
    expect((await api(e, '/api/auth/oauth', { provider: 'google', idToken: token, nonce })).body.user.providers).toEqual(['google']);
    expect((await api(e, '/api/auth/login', { email: 'victim@example.ch', password: 'attacker-pass' })).body.error).toBe('invalid_credentials');
  });
});

describe('sync and account deletion', () => {
  it('stores the data with versions, refuses stale writes, deletes everything', async () => {
    const e = env();
    const up = await api(e, '/api/auth/signup', { email: 'kati@example.ch', password: 'password123' });
    const { token } = (await api(e, '/api/auth/verify', { email: 'kati@example.ch', code: up.body.debugCode })).body;
    expect((await api(e, '/api/sync', undefined, token)).body).toMatchObject({ data: null, version: 0 });
    expect((await api(e, '/api/sync', { data: { v: 1, entries: { a: 1 } }, base: 0 }, token, 'PUT')).body.version).toBe(1);
    expect((await api(e, '/api/sync', { data: { v: 1 }, base: 0 }, token, 'PUT')).status).toBe(409);
    expect((await api(e, '/api/sync', { data: { v: 1, entries: { a: 2 } }, base: 1 }, token, 'PUT')).body.version).toBe(2);
    expect((await api(e, '/api/sync', undefined, token)).body).toMatchObject({ data: { entries: { a: 2 } }, version: 2 });
    expect((await api(e, '/api/sync', undefined)).status).toBe(401);
    expect((await api(e, '/api/account/delete', {}, token)).body.ok).toBe(true);
    expect((await api(e, '/api/auth/me', undefined, token)).status).toBe(401);
    expect((await api(e, '/api/auth/login', { email: 'kati@example.ch', password: 'password123' })).body.error).toBe('invalid_credentials');
  });

  it('tells the app which sign-in options exist', async () => {
    expect((await api(env(), '/api/auth/config')).body).toMatchObject({ accounts: true, aiMonthlyLimit: 6, google: { webClientId: 'web-client.apps.googleusercontent.com' }, apple: { servicesId: '' } });
    expect((await api({}, '/api/auth/config')).body).toMatchObject({ accounts: false, google: null, apple: null });
  });
});

describe('Sign in with Apple client secret', () => {
  it('is an ES256 JWT Apple can verify', async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
    const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----`;
    const jwt = await signEs256Jwt({ kid: 'KEY1234567' }, { iss: 'TEAM123456', sub: 'org.swissync.turni', aud: 'https://appleid.apple.com' }, pem);
    const [h, p, s] = jwt.split('.');
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0)), new TextEncoder().encode(`${h}.${p}`));
    expect(ok).toBe(true);
    expect(JSON.parse(atob(h.replace(/-/g, '+').replace(/_/g, '/')))).toMatchObject({ alg: 'ES256', kid: 'KEY1234567' });
  });
});
