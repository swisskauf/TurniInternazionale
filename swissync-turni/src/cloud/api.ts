import { apiEndpoint } from '@/lib/api';

/**
 * Talks to the Swissync Turni account service (`/api/auth`, `/api/sync`). The session token is
 * kept on the device; the server only stores its hash.
 */

const TOKEN_KEY = 'swissync-turni-session';
const CONFIG_KEY = 'swissync-turni-auth-config';

export interface AuthConfig {
  accounts: boolean;
  aiMonthlyLimit: number;
  google: { webClientId: string; iosClientId: string } | null;
  apple: { servicesId: string } | null;
}

export function apiBase(): string | null {
  const ai = apiEndpoint('ai');
  return ai ? ai.replace(/\/ai$/, '') : null;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Private mode: the session lasts until the app closes.
  }
}

export function cachedConfig(): AuthConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? (JSON.parse(raw) as AuthConfig) : null;
  } catch {
    return null;
  }
}

/** Which account features the server offers (cached for offline starts). */
export async function fetchConfig(): Promise<AuthConfig | null> {
  const base = apiBase();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/auth/config`);
    if (!res.ok) return cachedConfig();
    const j = (await res.json()) as AuthConfig;
    const config = { accounts: !!j.accounts, aiMonthlyLimit: j.aiMonthlyLimit ?? 6, google: j.google ?? null, apple: j.apple ?? null };
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch {
      // Not cached: asked again next time.
    }
    return config;
  } catch {
    return cachedConfig();
  }
}

export class ApiError extends Error {
  constructor(public code: string, public status = 0, public body: Record<string, unknown> = {}) {
    super(code);
  }
}

/** JSON request to the account service, with the session token when there is one. */
export async function apiCall<T = Record<string, unknown>>(path: string, opts: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const base = apiBase();
  if (!base) throw new ApiError('unavailable');
  const token = opts.auth === false ? null : getToken();
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError('network_error');
  }
  let body: Record<string, unknown> = {};
  try {
    body = await res.json();
  } catch {
    throw new ApiError(res.status === 404 ? 'unavailable' : 'network_error', res.status);
  }
  if (!res.ok || body.ok === false) throw new ApiError(String(body.error ?? 'auth_failed'), res.status, body);
  return body as T;
}
