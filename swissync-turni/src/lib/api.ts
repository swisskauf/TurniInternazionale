import { Capacitor } from '@capacitor/core';

/** Production server, used by the iOS/Android apps (the web app uses its own origin). */
const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) || 'https://turni.swissync.org').replace(/\/$/, '');

/** Where a server endpoint lives: same origin on the web, the production URL in native apps. */
export function apiEndpoint(name: 'ai' | 'account'): string {
  if (Capacitor.isNativePlatform() || import.meta.env.VITE_API_BASE) return `${API_BASE}/api/${name}`;
  return `/api/${name}`;
}
