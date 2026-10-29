import type { ServerEnv } from './env';

const NATIVE_ORIGINS = ['capacitor://localhost', 'ionic://localhost', 'https://localhost', 'http://localhost'];

/** Same origin, the native apps and configured extra origins may call the API. */
export function allowedOrigin(origin: string | null, request: Request, env: ServerEnv): string | null {
  if (!origin) return null;
  const extra = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const host = new URL(request.url).host;
  try {
    const o = new URL(origin);
    if (o.host === host) return origin;
    if (o.hostname === 'localhost' || o.hostname === '127.0.0.1') return origin;
  } catch {
    // Non-URL origins such as "null" are refused.
  }
  if (NATIVE_ORIGINS.includes(origin) || extra.includes(origin)) return origin;
  return null;
}

export function corsHeaders(request: Request, env: ServerEnv): { allow: string | null; headers: Record<string, string> } {
  const allow = allowedOrigin(request.headers.get('origin'), request, env);
  return {
    allow,
    headers: allow
      ? {
          'access-control-allow-origin': allow,
          'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
          'access-control-allow-headers': 'authorization, content-type, x-xai-key',
          'access-control-max-age': '86400',
          vary: 'origin',
        }
      : {},
  };
}

export function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cors },
  });
}

export function bearer(request: Request): string | null {
  const m = (request.headers.get('authorization') ?? '').match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export function clientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'local'
  );
}

/** Reads a small JSON body; null when too large or invalid. */
export async function readJson<T>(request: Request, max = 100_000): Promise<T | null> {
  try {
    const raw = await request.text();
    if (raw.length > max) return null;
    return JSON.parse(raw || '{}') as T;
  } catch {
    return null;
  }
}
