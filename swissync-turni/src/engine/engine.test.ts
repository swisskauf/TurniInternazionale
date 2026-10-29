import { describe, expect, it } from 'vitest';
import { computeDay, summarize, type SummaryOptions } from './hours';
import { createHolidayLookup, easterSunday, holidaysForYear } from './holidays';
import { calculatePay, roundStep } from './pay';
import { legacyScattaTurniProfile, legacyTypes } from './presets';
import { extractTimeRanges, parseHM, segmentMinutes, toAbsoluteIntervals, fmtHours } from './time';
import { payPeriodFor, payPeriodByLabel, isoWeek } from './dates';
import type { ShiftEntry, ShiftType } from './types';

const noHolidays = () => undefined;
const opts = (over: Partial<SummaryOptions> = {}): SummaryOptions => ({
  nightStart: '23:00', nightEnd: '06:00', holidayOf: noHolidays,
  weeklyHours: 0, workDaysPerWeek: 5, overtimeRule: 'none', overtimeDailyHours: 0, ...over,
});
const byId = (list: ShiftType[]) => Object.fromEntries(list.map((t) => [t.id, t]));
const entry = (date: string, t: ShiftType, extra: Partial<ShiftEntry> = {}): ShiftEntry => ({
  date, typeId: t.id, code: t.code, origin: 'manual', updatedAt: 0, ...extra,
});

describe('time', () => {
  it('parses the many ways times are written', () => {
    expect(parseHM('8')).toBe(480);
    expect(parseHM('08.30')).toBe(510);
    expect(parseHM('0830')).toBe(510);
    expect(parseHM('8h30')).toBe(510);
    expect(parseHM('24:00')).toBe(1440);
    expect(parseHM('25:00')).toBeNull();
    expect(parseHM('abc')).toBeNull();
  });
  it('handles overnight segments', () => {
    expect(segmentMinutes({ start: '22:00', end: '06:00' })).toBe(480);
    expect(toAbsoluteIntervals([{ start: '20:00', end: '23:00' }, { start: '23:30', end: '02:00' }])).toEqual([[1200, 1380], [1410, 1560]]);
    expect(toAbsoluteIntervals([{ start: '22:00', end: '23:00' }, { start: '01:00', end: '03:00' }])).toEqual([[1320, 1380], [1500, 1620]]);
  });
  it('extracts time ranges from free text', () => {
    expect(extractTimeRanges('08:00-12:00 / 12:36–17:18')).toEqual([{ start: '08:00', end: '12:00' }, { start: '12:36', end: '17:18' }]);
    expect(extractTimeRanges('dalle 8-12 e 13.30-17')).toEqual([{ start: '08:00', end: '12:00' }, { start: '13:30', end: '17:00' }]);
    expect(extractTimeRanges('1-2')).toEqual([]);
  });
  it('formats hours', () => {
    expect(fmtHours(7.5)).toBe('7.50');
    expect(fmtHours(7.5, 'hm')).toBe('7h 30');
    expect(fmtHours(8, 'hm')).toBe('8h');
  });
});

describe('dates', () => {
  it('computes pay periods with a custom start day', () => {
    expect(payPeriodFor('2026-11-05', 21)).toEqual({ start: '2026-10-21', end: '2026-11-20', label: '2026-11' });
    expect(payPeriodFor('2026-11-25', 21)).toEqual({ start: '2026-11-21', end: '2026-12-20', label: '2026-12' });
    expect(payPeriodByLabel('2026-12', 21)).toEqual({ start: '2026-11-21', end: '2026-12-20', label: '2026-12' });
    expect(payPeriodByLabel('2026-02', 1)).toEqual({ start: '2026-02-01', end: '2026-02-28', label: '2026-02' });
  });
  it('computes ISO weeks', () => {
    expect(isoWeek('2026-01-01')).toEqual({ year: 2026, week: 1 });
    expect(isoWeek('2027-01-01')).toEqual({ year: 2026, week: 53 });
  });
});

describe('holidays', () => {
  it('computes Easter', () => {
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
  });
  it('knows Ticino holidays', () => {
    const h = holidaysForYear(2026, { country: 'CH', region: 'TI', customHolidays: [], ignoredHolidays: [] });
    expect(h.get('2026-03-19')).toBe('stJoseph');
    expect(h.get('2026-06-04')).toBe('corpusChristi');
    expect(h.get('2026-08-01')).toBe('swissNational');
    expect(h.has('2026-04-03')).toBe(false); // no Good Friday in TI
  });
  it('supports custom and ignored days', () => {
    const lookup = createHolidayLookup({ country: 'IT', region: '', customHolidays: [{ date: '2026-12-07', name: 'Sant’Ambrogio' }], ignoredHolidays: ['2026-12-26'] });
    expect(lookup('2026-12-07')).toBe('custom:Sant’Ambrogio');
    expect(lookup('2026-12-26')).toBeUndefined();
    expect(lookup('2026-10-04')).toBe('stFrancis');
  });
});

describe('hours', () => {
  const types = legacyTypes();
  const T = Object.fromEntries(types.map((t) => [t.code, t]));
  it('computes a split shift', () => {
    const d = computeDay('2026-11-02', entry('2026-11-02', T.P1), byId(types), opts());
    expect(d.workedMin).toBe(4 * 60 + 282); // 4h + 4h42
    expect(d.breakMin).toBe(36);
    expect(d.nightMin).toBe(0);
  });
  it('splits night and Sunday minutes across midnight', () => {
    const night: ShiftType = { ...T.P1, id: 'n', code: 'N', segments: [{ start: '22:00', end: '06:00' }], unpaidBreakMin: 30 };
    // Saturday 2026-11-07 22:00 → Sunday 06:00
    const d = computeDay('2026-11-07', entry('2026-11-07', night), { n: night }, opts());
    expect(d.workedMin).toBe(450);
    expect(d.nightMin).toBe(420); // 23–06
    expect(d.sundayMin).toBe(360); // 00–06 on Sunday
    expect(d.saturdayMin).toBe(120);
  });
  it('counts absences and unknown codes', () => {
    const s = summarize('2026-11-01', '2026-11-30', {
      '2026-11-02': entry('2026-11-02', T.P1),
      '2026-11-03': entry('2026-11-03', T.GV),
      '2026-11-04': { date: '2026-11-04', code: 'XYZ', origin: 'import', updatedAt: 0 },
    }, byId(types), opts({ weeklyHours: 42, workDaysPerWeek: 5 }));
    expect(s.daysWorked).toBe(1);
    expect(s.kindCounts.vacation).toBe(1);
    expect(s.unknownCodes).toEqual(['XYZ']);
    expect(s.targetMin).toBe(21 * 504); // 21 weekdays × 8.4h
  });
  it('computes weekly overtime', () => {
    const long: ShiftType = { ...T.P1, id: 'l', segments: [{ start: '07:00', end: '17:00' }] };
    const entries: Record<string, ShiftEntry> = {};
    for (const d of ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']) entries[d] = entry(d, long);
    const s = summarize('2026-11-02', '2026-11-08', entries, { l: long }, opts({ weeklyHours: 42, overtimeRule: 'weekly' }));
    expect(s.workedMin).toBe(3000);
    expect(s.overtimeMin).toBe(3000 - 2520);
  });
});

describe('pay', () => {
  it('rounds to 5 cents', () => {
    expect(roundStep(10.024, 0.05)).toBe(10);
    expect(roundStep(10.026, 0.05)).toBe(10.05);
    expect(roundStep(10.074, 0.05)).toBe(10.05);
  });
  it('reproduces the original ScattaTurni Swiss calculation', () => {
    const profile = legacyScattaTurniProfile('it');
    // 100 h, 10 Sunday hours, 5 night hours.
    const summary = { workedMin: 6000, creditedMin: 0, sundayMin: 600, nightMin: 300, saturdayMin: 0, holidayMin: 0, overtimeMin: 0 } as Parameters<typeof calculatePay>[0];
    const r = calculatePay(summary, profile, 42);
    const r05 = (v: number) => Math.round(v * 20) / 20;
    const base = r05(100 * 19.75);
    const vac = r05(base * 0.1065);
    const hol = r05(base * 0.0227);
    const th = r05((base + vac + hol) * 0.0833);
    const sun = r05(10 * 19.75 * 0.25);
    const nig = r05(5 * 19.75 * 0.1);
    const grossAVS = r05(base + vac + hol + th + sun + nig);
    const clothing = r05(100 * 0.25);
    const gross = r05(grossAVS + clothing);
    const deductions = [
      r05(grossAVS * 0.053), r05(grossAVS * 0.011), r05(grossAVS * 0.01445), r05(grossAVS * 0.01672),
      r05((base / 2) * 0.01), r05(gross * 0.03),
    ];
    const total = r05(deductions.reduce((a, b) => a + b, 0));
    expect(r.baseWage).toBe(base);
    expect(r.socialGross).toBe(grossAVS);
    expect(r.gross).toBe(gross);
    expect(r.totalDeductions).toBe(total);
    expect(r.net).toBe(r05(gross - total));
  });
});

import { legendFromTokens, parseLegendText, subtractBreaks } from './legend';
describe('legend parser', () => {
  it('parses legend lines without AI', () => {
    const r = parseLegendText('P1 08:00-12:00 12:36-17:18\nN = Notte 22-6 (pausa 30 min)\nGR riposo\nF: Ferie');
    expect(r[0]).toMatchObject({ code: 'P1', kind: 'work', segments: [{ start: '08:00', end: '12:00' }, { start: '12:36', end: '17:18' }] });
    expect(r[1]).toMatchObject({ code: 'N', name: 'Notte', unpaidBreakMin: 30, segments: [{ start: '22:00', end: '06:00' }] });
    expect(r[2]).toMatchObject({ code: 'GR', kind: 'rest' });
    expect(r[3]).toMatchObject({ code: 'F', kind: 'vacation', name: 'Ferie' });
  });
});

describe('legend with breaks', () => {
  it('removes break windows from working hours', () => {
    expect(subtractBreaks([{ start: '08:00', end: '17:18' }], [{ start: '12:00', end: '12:36' }])).toEqual([
      { start: '08:00', end: '12:00' },
      { start: '12:36', end: '17:18' },
    ]);
    expect(subtractBreaks([{ start: '22:00', end: '06:00' }], [{ start: '02:00', end: '02:30' }])).toEqual([
      { start: '22:00', end: '02:00' },
      { start: '02:30', end: '06:00' },
    ]);
  });

  it('reads "Orario di lavoro … Pausa …" legends', () => {
    const r = parseLegendText(
      'P1 Piani 1 Orario di lavoro: 08:00-17:18 Pausa: 12:00-12:36\n' +
        'R+P1 Ristorante + P1 Orario di lavoro: 05:00-08:00 Pausa: 07:30-08:00 Orario di lavoro: 08:00-15:12 Pausa: 12:00-12:30',
    );
    expect(r[0]).toMatchObject({ code: 'P1', name: 'Piani 1', kind: 'work', segments: [{ start: '08:00', end: '12:00' }, { start: '12:36', end: '17:18' }] });
    expect(r[1].segments).toEqual([
      { start: '05:00', end: '07:30' },
      { start: '08:00', end: '12:00' },
      { start: '12:30', end: '15:12' },
    ]);
  });

  it('finds the legend of a rotated photo, skipping the table rows', () => {
    const tilt = 0.03;
    const tokens: { text: string; x: number; y: number; w: number; h: number; page: number }[] = [];
    const line = (y: number, words: [string, number][]) => {
      for (const [text, x] of words) tokens.push({ text, x, y: y + tilt * x, w: text.length * 8, h: 12, page: 1 });
    };
    line(100, [['Rossi', 20], ['P1', 200], ['GR', 260], ['P1', 320], ['MA', 380]]);
    line(300, [['GR:', 20], ['Libero', 50]]);
    line(325, [['MA:', 20], ['Malattia', 50]]);
    line(360, [['Reparto', 20], ['P1', 120], ['Piani', 170], ['1', 215], ['Orario', 330], ['di', 385], ['lavoro:', 405], ['08:00-17:18', 465], ['Pausa:', 560], ['12:00-12:36', 615]]);
    const r = legendFromTokens(tokens, ['P1', 'GR', 'MA']);
    const by = Object.fromEntries(r.map((d) => [d.code, d]));
    expect(by.GR).toMatchObject({ kind: 'rest', name: 'Libero' });
    expect(by.MA).toMatchObject({ kind: 'sick' });
    expect(by.P1.segments).toEqual([{ start: '08:00', end: '12:00' }, { start: '12:36', end: '17:18' }]);
  });
});
