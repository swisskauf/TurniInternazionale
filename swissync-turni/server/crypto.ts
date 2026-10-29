/** WebCrypto helpers (Cloudflare Workers, browsers and Node all provide `crypto.subtle`). */

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64url(bytes: Uint8Array | ArrayBuffer): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export function randomToken(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** A 6-digit code, uniformly distributed. */
export function randomCode(): string {
  const max = 4_294_000_000; // multiple of 1e6 below 2^32: no modulo bias
  for (;;) {
    const v = crypto.getRandomValues(new Uint32Array(1))[0];
    if (v < max) return String(v % 1_000_000).padStart(6, '0');
  }
}

export async function sha256Hex(text: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

export async function hmacHex(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Workers cap PBKDF2 at 100k iterations.
const PBKDF2_ITERATIONS = 100_000;

export async function hashPassword(password: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return `pbkdf2$${iterations}$${b64url(salt)}$${b64url(bits)}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const [scheme, iter, salt, hash] = (stored ?? '').split('$');
  if (scheme !== 'pbkdf2' || !iter || !salt || !hash) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromB64url(salt), iterations: Number(iter) }, key, 256);
  return safeEqual(b64url(bits), hash);
}

async function aesKey(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(`turni-aes:${secret}`));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptText(secret: string, text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), enc.encode(text));
  return `${b64url(iv)}.${b64url(ct)}`;
}

export async function decryptText(secret: string, blob: string): Promise<string> {
  const [iv, ct] = blob.split('.');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(iv) }, await aesKey(secret), fromB64url(ct));
  return dec.decode(pt);
}

function pemBody(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const b = atob(body);
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

/** ES256 JWT (e.g. the client secret Sign in with Apple requires). */
export async function signEs256Jwt(header: Record<string, unknown>, payload: Record<string, unknown>, pkcs8Pem: string): Promise<string> {
  const key = await crypto.subtle.importKey('pkcs8', pemBody(pkcs8Pem), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const data = `${b64url(enc.encode(JSON.stringify({ alg: 'ES256', typ: 'JWT', ...header })))}.${b64url(enc.encode(JSON.stringify(payload)))}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(data));
  return `${data}.${b64url(sig)}`;
}

export interface Jwk {
  kid: string;
  kty: string;
  n?: string;
  e?: string;
  alg?: string;
}

const jwksCache = new Map<string, { keys: Jwk[]; at: number }>();

async function jwks(url: string, fetcher: typeof fetch): Promise<Jwk[]> {
  const hit = jwksCache.get(url);
  if (hit && Date.now() - hit.at < 3_600_000) return hit.keys;
  const res = await fetcher(url);
  if (!res.ok) throw new Error('jwks_unavailable');
  const { keys } = (await res.json()) as { keys: Jwk[] };
  jwksCache.set(url, { keys, at: Date.now() });
  return keys;
}

/** Verifies an RS256 ID token against a provider's published keys; returns its claims. */
export async function verifyIdToken(
  token: string,
  opts: { jwksUrl: string; issuers: string[]; audiences: string[]; now?: number; fetcher?: typeof fetch },
): Promise<Record<string, unknown>> {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) throw new Error('bad_token');
  const header = JSON.parse(dec.decode(fromB64url(h))) as { alg?: string; kid?: string };
  if (header.alg !== 'RS256') throw new Error('bad_token');
  const keys = await jwks(opts.jwksUrl, opts.fetcher ?? fetch);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('unknown_key');
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromB64url(s), enc.encode(`${h}.${p}`));
  if (!ok) throw new Error('bad_signature');
  const claims = JSON.parse(dec.decode(fromB64url(p))) as Record<string, unknown>;
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  if (!opts.issuers.includes(String(claims.iss))) throw new Error('bad_issuer');
  const aud = Array.isArray(claims.aud) ? claims.aud.map(String) : [String(claims.aud)];
  if (!aud.some((a) => opts.audiences.includes(a))) throw new Error('bad_audience');
  if (typeof claims.exp !== 'number' || claims.exp < now - 60) throw new Error('expired');
  return claims;
}
