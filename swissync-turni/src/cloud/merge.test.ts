import { describe, expect, it } from 'vitest';
import { emptyPayProfile } from '@/engine/presets';
import { defaultProfile } from '@/store/store';
import type { ShiftEntry } from '@/engine/types';
import { mergeSync, sameSync, type SyncData } from './merge';

const T = 1_800_000_000_000;
const entry = (date: string, code: string, updatedAt: number): ShiftEntry => ({ date, code, origin: 'manual', updatedAt: T + updatedAt });

function data(partial: Partial<SyncData>): SyncData {
  return { v: 1, profile: defaultProfile(), types: {}, entries: {}, scripts: {}, pay: emptyPayProfile(), payslips: [], imports: [], tombstones: {}, ...partial };
}

describe('sync merge', () => {
  const now = T + 1000;

  it('keeps the latest change of each day from both devices', () => {
    const phone = data({ entries: { '2026-10-05': entry('2026-10-05', 'P1', 10), '2026-10-06': entry('2026-10-06', 'GR', 30) } });
    const laptop = data({ entries: { '2026-10-05': entry('2026-10-05', 'R+P1', 20), '2026-10-07': entry('2026-10-07', 'P1', 5) } });
    const m = mergeSync(phone, laptop, now);
    expect(Object.fromEntries(Object.entries(m.entries).map(([d, e]) => [d, e.code]))).toEqual({ '2026-10-05': 'R+P1', '2026-10-06': 'GR', '2026-10-07': 'P1' });
    // Same result whichever side merges.
    expect(sameSync(m, mergeSync(laptop, phone, now))).toBe(true);
  });

  it('propagates deletions, unless the day was changed again afterwards', () => {
    const phone = data({ tombstones: { 'entry:2026-10-05': T + 50, 'entry:2026-10-06': T + 50 } });
    const laptop = data({ entries: { '2026-10-05': entry('2026-10-05', 'P1', 40), '2026-10-06': entry('2026-10-06', 'GR', 60) } });
    const m = mergeSync(phone, laptop, now);
    expect(Object.keys(m.entries)).toEqual(['2026-10-06']);
    expect(m.tombstones['entry:2026-10-05']).toBe(T + 50);
  });

  it('takes the newer profile and pay settings, and forgets very old deletions', () => {
    const a = data({ profile: { ...defaultProfile(), name: 'A', updatedAt: T + 5 }, pay: { ...emptyPayProfile(), updatedAt: T + 1 }, tombstones: { 'entry:2020-01-01': now - 500 * 86_400_000 } });
    const b = data({ profile: { ...defaultProfile(), name: 'B', updatedAt: T + 9 }, pay: { ...emptyPayProfile(), hourlyRate: 31, updatedAt: T + 3 } });
    const m = mergeSync(a, b, now);
    expect(m.profile.name).toBe('B');
    expect(m.pay.hourlyRate).toBe(31);
    expect(m.tombstones).toEqual({});
  });

  it('merges payslips and imports by id', () => {
    const slip = (id: string, period: string) => ({ id, period, employer: '', currency: 'CHF', hoursPaid: 0, gross: 0, net: 0, lines: [], createdAt: T + 1 });
    const m = mergeSync(data({ payslips: [slip('a', '2026-09')] }), data({ payslips: [slip('b', '2026-10')], tombstones: { 'payslip:a': T + 2 } }), now);
    expect(m.payslips.map((p) => p.id)).toEqual(['b']);
  });
});
