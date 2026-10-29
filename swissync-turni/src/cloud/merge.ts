import type {
  ImportLog, ISODate, PayProfile, PayslipRecord, Profile, RecognitionScript, ShiftEntry, ShiftType,
} from '@/engine/types';

/** What is kept in the account (the xAI key and device settings stay on the device). */
export interface SyncData {
  v: 1;
  profile: Profile;
  types: Record<string, ShiftType>;
  entries: Record<ISODate, ShiftEntry>;
  scripts: Record<string, RecognitionScript>;
  pay: PayProfile;
  payslips: PayslipRecord[];
  imports: ImportLog[];
  /** Deletions, as "kind:id" → time, so a device that missed them doesn't bring the item back. */
  tombstones: Record<string, number>;
}

const TOMBSTONE_TTL = 400 * 86_400_000;

function mergeMap<T>(kind: string, a: Record<string, T>, b: Record<string, T>, tombs: Record<string, number>, stamp: (x: T) => number): Record<string, T> {
  const out: Record<string, T> = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[key];
    const y = b[key];
    const pick = x === undefined ? y : y === undefined ? x : stamp(y) > stamp(x) ? y : x;
    const gone = tombs[`${kind}:${key}`];
    if (pick !== undefined && !(gone && gone >= stamp(pick))) out[key] = pick;
  }
  return out;
}

const byId = <T extends { id: string }>(list: T[]) => Object.fromEntries(list.map((x) => [x.id, x]));

/**
 * Merges two copies of the data (this device and the account). For every shift, type, script…
 * the most recent change wins; deletions win over older changes. `a` wins ties.
 */
export function mergeSync(a: SyncData, b: SyncData, now = Date.now()): SyncData {
  const tombstones: Record<string, number> = {};
  for (const [k, t] of [...Object.entries(a.tombstones ?? {}), ...Object.entries(b.tombstones ?? {})]) {
    if (now - t < TOMBSTONE_TTL) tombstones[k] = Math.max(tombstones[k] ?? 0, t);
  }
  const updated = (x: { updatedAt?: number }) => x.updatedAt ?? 0;
  const payslips = mergeMap('payslip', byId(a.payslips ?? []), byId(b.payslips ?? []), tombstones, (x) => x.createdAt ?? 0);
  const imports = mergeMap('import', byId(a.imports ?? []), byId(b.imports ?? []), tombstones, (x) => x.at ?? 0);
  return {
    v: 1,
    profile: updated(b.profile ?? {}) > updated(a.profile ?? {}) ? b.profile : a.profile,
    types: mergeMap('type', a.types ?? {}, b.types ?? {}, tombstones, updated),
    entries: mergeMap('entry', a.entries ?? {}, b.entries ?? {}, tombstones, updated),
    scripts: mergeMap('script', a.scripts ?? {}, b.scripts ?? {}, tombstones, updated),
    pay: updated(b.pay ?? {}) > updated(a.pay ?? {}) ? b.pay : a.pay,
    payslips: Object.values(payslips).sort((x, y) => y.period.localeCompare(x.period)).slice(0, 36),
    imports: Object.values(imports).sort((x, y) => y.at - x.at).slice(0, 50),
    tombstones,
  };
}

/** Stable comparison of two copies (key order doesn't matter). */
export function sameSync(a: SyncData, b: SyncData): boolean {
  return stableJson(a) === stableJson(b);
}

function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}
