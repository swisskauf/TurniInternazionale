import { useSyncExternalStore } from 'react';

export type RoutePath =
  | '/' | '/calendar' | '/import' | '/hours' | '/earnings' | '/types' | '/scripts' | '/settings' | '/pay-setup';

export interface Route {
  path: RoutePath;
  params: URLSearchParams;
}

const KNOWN: RoutePath[] = ['/', '/calendar', '/import', '/hours', '/earnings', '/types', '/scripts', '/settings', '/pay-setup'];

function parse(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [p, q] = raw.split('?');
  const path = (KNOWN.includes(p as RoutePath) ? p : '/') as RoutePath;
  return { path, params: new URLSearchParams(q ?? '') };
}

let current = parse();
const listeners = new Set<() => void>();
window.addEventListener('hashchange', () => {
  current = parse();
  listeners.forEach((l) => l());
  window.scrollTo({ top: 0 });
});

export function useRoute(): Route {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}

export function navigate(path: RoutePath, params?: Record<string, string>) {
  const q = params ? `?${new URLSearchParams(params).toString()}` : '';
  const next = `#${path}${q}`;
  if (window.location.hash !== next) window.location.hash = next;
}

export function goBack(fallback: RoutePath = '/') {
  if (window.history.length > 1) window.history.back();
  else navigate(fallback);
}
