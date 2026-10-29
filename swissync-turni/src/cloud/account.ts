import { create } from 'zustand';
import { Capacitor } from '@capacitor/core';
import { useStore } from '@/store/store';
import { ApiError, apiBase, apiCall, cachedConfig, fetchConfig, getToken, setToken, type AuthConfig } from './api';
import { startSync, stopSync } from './sync';

/** The app's identifier with Apple (Sign in with Apple audience). */
export const APP_BUNDLE_ID = 'org.swissync.turni';

export interface AccountUser {
  id: string;
  email: string;
  name: string;
  providers: string[];
}

export interface AccountState {
  status: 'unavailable' | 'loading' | 'signed-out' | 'signed-in';
  config: AuthConfig | null;
  user: AccountUser | null;
  /** Waiting for the 6-digit code sent by e-mail. */
  pending: { email: string; purpose: 'verify' | 'reset' } | null;
  /** Development servers return the code instead of e-mailing it. */
  debugCode?: string;
  /** xAI analyses used / allowed this month. */
  quota: { used: number; limit: number } | null;
  sync: { state: 'idle' | 'syncing' | 'error' | 'offline' };
}

const USER_KEY = 'swissync-turni-user';

function cachedUser(): AccountUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AccountUser) : null;
  } catch {
    return null;
  }
}

export const useAccount = create<AccountState>(() => ({
  status: apiBase() ? 'loading' : 'unavailable',
  config: cachedConfig(),
  user: null,
  pending: null,
  quota: null,
  sync: { state: 'idle' },
}));

/** Accounts are offered (the server has them, or we don't know yet). */
export const useAccountsAvailable = () => useAccount((s) => s.status !== 'unavailable' && s.config?.accounts !== false);

export class AccountError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

const asAccountError = (e: unknown) => new AccountError(e instanceof ApiError || e instanceof AccountError ? e.code : 'auth_failed');

function setUser(user: AccountUser | null) {
  const was = useAccount.getState().user?.id;
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    // Not cached: fetched again at the next start.
  }
  useAccount.setState({ user, status: user ? 'signed-in' : 'signed-out' });
  if (user && user.id !== was) {
    startSync();
    // A name from Apple/Google fills an empty profile.
    const profile = useStore.getState().profile;
    if (!profile.name && user.name) useStore.getState().setProfile({ name: user.name });
  }
  if (!user && was) {
    stopSync();
    useAccount.setState({ quota: null });
  }
}

function signedIn(res: { token?: string; user?: AccountUser; quota?: AccountState['quota'] }) {
  if (!res.token || !res.user) throw new AccountError('auth_failed');
  setToken(res.token);
  useAccount.setState({ pending: null, debugCode: undefined, quota: res.quota ?? null });
  setUser(res.user);
}

let started = false;

/** Restores the session at start; works offline with the last known account. */
export async function initAccount(): Promise<void> {
  if (started || !apiBase()) return;
  started = true;
  const offlineUser = getToken() ? cachedUser() : null;
  if (offlineUser) setUser(offlineUser);
  const config = await fetchConfig();
  if (!config?.accounts) {
    useAccount.setState({ status: offlineUser ? 'signed-in' : 'unavailable', config });
    return;
  }
  useAccount.setState({ config });
  if (!getToken()) {
    useAccount.setState({ status: 'signed-out' });
    return;
  }
  try {
    const me = await apiCall<{ user: AccountUser; quota: AccountState['quota'] }>('/auth/me');
    useAccount.setState({ quota: me.quota });
    setUser(me.user);
  } catch (e) {
    // Revoked or expired session: signed out. Offline: keep working with the cached account.
    if (e instanceof ApiError && e.status === 401) {
      setToken(null);
      setUser(null);
    } else if (!offlineUser) useAccount.setState({ status: 'signed-out' });
  }
}

const locale = () => useStore.getState().profile.locale;

export async function signUpWithEmail(email: string, password: string): Promise<void> {
  try {
    const res = await apiCall<{ debugCode?: string }>('/auth/signup', { body: { email, password, locale: locale(), name: useStore.getState().profile.name }, auth: false });
    useAccount.setState({ pending: { email: email.trim().toLowerCase(), purpose: 'verify' }, debugCode: res.debugCode });
  } catch (e) {
    throw asAccountError(e);
  }
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  try {
    signedIn(await apiCall('/auth/login', { body: { email, password, locale: locale() }, auth: false }));
  } catch (e) {
    // Not confirmed yet: the server just sent a new code.
    if (e instanceof ApiError && e.code === 'email_not_confirmed') {
      useAccount.setState({ pending: { email: email.trim().toLowerCase(), purpose: 'verify' }, debugCode: e.body.debugCode as string | undefined });
      return;
    }
    throw asAccountError(e);
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  try {
    const res = await apiCall<{ debugCode?: string }>('/auth/reset-request', { body: { email, locale: locale() }, auth: false });
    useAccount.setState({ pending: { email: email.trim().toLowerCase(), purpose: 'reset' }, debugCode: res.debugCode });
  } catch (e) {
    throw asAccountError(e);
  }
}

/** Confirms the e-mail (sign-up) or sets the new password (reset) with the 6-digit code. */
export async function submitCode(code: string, newPassword?: string): Promise<void> {
  const pending = useAccount.getState().pending;
  if (!pending) throw new AccountError('auth_failed');
  try {
    if (pending.purpose === 'reset') signedIn(await apiCall('/auth/reset-confirm', { body: { email: pending.email, code, password: newPassword }, auth: false }));
    else signedIn(await apiCall('/auth/verify', { body: { email: pending.email, code }, auth: false }));
  } catch (e) {
    throw asAccountError(e);
  }
}

export async function resendCode(): Promise<void> {
  const pending = useAccount.getState().pending;
  if (!pending) return;
  try {
    const res = await apiCall<{ debugCode?: string }>('/auth/resend', { body: { email: pending.email, purpose: pending.purpose, locale: locale() }, auth: false });
    if (res.debugCode) useAccount.setState({ debugCode: res.debugCode });
  } catch (e) {
    throw asAccountError(e);
  }
}

export function cancelCode() {
  useAccount.setState({ pending: null, debugCode: undefined });
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const randomNonce = () => [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Which social sign-in buttons this device can show. */
export function socialProviders(config: AuthConfig | null): { google: boolean; apple: boolean } {
  const platform = Capacitor.getPlatform();
  return {
    google: !!config?.google?.webClientId && (platform !== 'ios' || !!config.google.iosClientId),
    // Sign in with Apple: on iPhone/iPad, and on the web when a Services ID is set up.
    apple: !!config?.apple && (platform === 'ios' || (platform === 'web' && !!config.apple.servicesId)),
  };
}

/** Sign in with Google or Apple: the system sheet in the apps, a pop-up on the web. */
export async function signInWithProvider(provider: 'google' | 'apple'): Promise<void> {
  const config = useAccount.getState().config;
  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  const web = Capacitor.getPlatform() === 'web';
  try {
    await SocialLogin.initialize({
      google: config?.google ? { webClientId: config.google.webClientId, iOSClientId: config.google.iosClientId || undefined, iOSServerClientId: config.google.webClientId, mode: 'online' } : undefined,
      apple: config?.apple ? (web ? { clientId: config.apple.servicesId, redirectUrl: window.location.origin } : { redirectUrl: '' }) : undefined,
    });
    // The provider signs a hash of the nonce; the server checks it against the original.
    const nonce = randomNonce();
    const hashed = await sha256Hex(nonce);
    let body: Record<string, unknown>;
    if (provider === 'google') {
      const res = await SocialLogin.login({ provider: 'google', options: { scopes: ['email', 'profile'], nonce: hashed } });
      body = { provider, idToken: 'idToken' in res.result ? res.result.idToken : null, nonce };
    } else {
      const res = await SocialLogin.login({ provider: 'apple', options: { scopes: ['email', 'name'], nonce: hashed } });
      const name = [res.result.profile?.givenName, res.result.profile?.familyName].filter(Boolean).join(' ');
      body = { provider, idToken: res.result.idToken, nonce, name, appleCode: res.result.authorizationCode ?? res.result.accessToken?.token, clientId: web ? config?.apple?.servicesId : APP_BUNDLE_ID };
    }
    if (!body.idToken) throw new AccountError('auth_failed');
    signedIn(await apiCall('/auth/oauth', { body: { ...body, locale: locale() }, auth: false }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/cancel/i.test(msg)) throw new AccountError('cancelled');
    throw asAccountError(e);
  }
}

export async function signOut(): Promise<void> {
  await apiCall('/auth/logout', { body: {} }).catch(() => undefined);
  setToken(null);
  setUser(null);
}

/** Deletes the account and its cloud copy; optionally also this device's data. */
export async function deleteAccount(alsoThisDevice: boolean): Promise<void> {
  try {
    await apiCall('/account/delete', { body: {} });
  } catch (e) {
    throw new AccountError(e instanceof ApiError ? e.code : 'delete_failed');
  }
  stopSync();
  setToken(null);
  setUser(null);
  useStore.getState().setCloud({ userId: null, version: 0, lastSyncAt: 0 });
  if (alsoThisDevice) useStore.getState().resetAll();
}

/** Refreshes "x of 6 xAI analyses used this month". */
export async function refreshQuota(): Promise<void> {
  if (!getToken()) return;
  try {
    const me = await apiCall<{ quota: AccountState['quota'] }>('/auth/me');
    useAccount.setState({ quota: me.quota });
  } catch {
    // Shown again at the next refresh.
  }
}

export const accessToken = async () => getToken();
