import { emptyPayProfile } from '@/engine/presets';
import { ensureStarterTypes, useStore, type AppState } from '@/store/store';
import { useAccount } from './account';
import { ApiError, apiCall, getToken } from './api';
import { mergeSync, sameSync, type SyncData } from './merge';

/**
 * Keeps this device and the account in step: on start, on every change (debounced) and when
 * the app comes back to the foreground. Works offline; changes go up at the next chance.
 */

const SYNCED: (keyof AppState)[] = ['profile', 'types', 'entries', 'scripts', 'pay', 'payslips', 'imports', 'tombstones'];

export function snapshot(s: AppState): SyncData {
  return { v: 1, profile: s.profile, types: s.types, entries: s.entries, scripts: s.scripts, pay: s.pay, payslips: s.payslips, imports: s.imports, tombstones: s.tombstones };
}

function normalize(raw: Partial<SyncData> | null | undefined, s: AppState): SyncData {
  return {
    v: 1,
    profile: { ...s.profile, ...(raw?.profile ?? {}) },
    types: raw?.types ?? {},
    entries: raw?.entries ?? {},
    scripts: raw?.scripts ?? {},
    pay: { ...emptyPayProfile(), ...(raw?.pay ?? {}) },
    payslips: raw?.payslips ?? [],
    imports: raw?.imports ?? [],
    tombstones: raw?.tombstones ?? {},
  };
}

/** A fresh start for an account that has no data yet, on a device used by another account. */
function blank(s: AppState): SyncData {
  return normalize({ profile: { ...s.profile, name: '', employer: '', employeeId: '', department: '', updatedAt: 0 } }, s);
}

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let again = false;
let unsubscribe: (() => void) | null = null;

const setSync = (state: AccountStateSync) => useAccount.setState({ sync: { state } });
type AccountStateSync = 'idle' | 'syncing' | 'error' | 'offline';

function schedule(delay = 2500) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void syncNow();
  }, delay);
}

const onVisible = () => {
  if (document.visibilityState === 'visible') schedule(300);
};
const onOnline = () => schedule(300);

export function startSync() {
  stopSync();
  unsubscribe = useStore.subscribe((s, prev) => {
    if (SYNCED.some((k) => s[k] !== prev[k])) schedule();
  });
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);
  void syncNow();
}

export function stopSync() {
  unsubscribe?.();
  unsubscribe = null;
  if (timer) clearTimeout(timer);
  timer = null;
  document.removeEventListener('visibilitychange', onVisible);
  window.removeEventListener('online', onOnline);
}

const pull = () => apiCall<{ data: Partial<SyncData> | null; version: number }>('/sync');
const push = (data: SyncData, base: number) => apiCall<{ version: number }>('/sync', { method: 'PUT', body: { data, base } });

/** One round: download the account copy, merge, apply here, upload the result. */
export async function syncNow(): Promise<void> {
  const uid = useAccount.getState().user?.id;
  if (!uid || !getToken()) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  setSync('syncing');
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const row = await pull();
      const store = useStore.getState();
      const remote = row.data ? normalize(row.data, store) : null;
      // This device's data belongs to another account: start from this account's copy.
      const switched = !!store.cloud.userId && store.cloud.userId !== uid;
      const local = switched ? blank(store) : snapshot(store);
      const merged = remote ? mergeSync(local, remote) : local;
      if (switched || !sameSync(merged, snapshot(store))) {
        store.applySync(merged);
        if (!Object.keys(merged.types).length) ensureStarterTypes(store.profile.locale);
      }
      const now = Date.now();
      const current = snapshot(useStore.getState());
      if (remote && sameSync(current, remote)) {
        store.setCloud({ userId: uid, version: row.version, lastSyncAt: now });
        break;
      }
      try {
        const { version } = await push(current, row.version);
        store.setCloud({ userId: uid, version, lastSyncAt: now });
        break;
      } catch (e) {
        // Another device saved in the meantime: merge again on top of its copy.
        if (e instanceof ApiError && e.code === 'conflict') continue;
        throw e;
      }
    }
    setSync('idle');
  } catch {
    setSync(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'error');
  } finally {
    running = false;
    if (again) {
      again = false;
      schedule(500);
    }
  }
}

/** Deletes the data everywhere ("delete all data" while signed in): every item becomes a deletion. */
export async function wipeCloudCopy(): Promise<void> {
  const uid = useAccount.getState().user?.id;
  if (!uid) return;
  stopSync();
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await pull();
    const store = useStore.getState();
    const remote = normalize(row.data ?? {}, store);
    const now = Date.now();
    const tombstones: Record<string, number> = { ...remote.tombstones };
    const bury = (kind: string, keys: string[]) => keys.forEach((k) => (tombstones[`${kind}:${k}`] = now));
    for (const src of [remote, snapshot(store)]) {
      bury('entry', Object.keys(src.entries));
      bury('type', Object.keys(src.types));
      bury('script', Object.keys(src.scripts));
      bury('payslip', src.payslips.map((x) => x.id));
      bury('import', src.imports.map((x) => x.id));
    }
    try {
      const { version } = await push({ ...blank(store), tombstones }, row.version);
      store.setCloud({ userId: uid, version, lastSyncAt: now });
      return;
    } catch (e) {
      if (!(e instanceof ApiError && e.code === 'conflict')) throw e;
    }
  }
}
