import { addDays, diffDays, eachDay, isSaturday, isSunday, weekKey, weekdayIndex } from './dates';
import { gapMinutes, overlap, parseHM, toAbsoluteIntervals } from './time';
import type { DayKind, ISODate, Segment, ShiftEntry, ShiftType } from './types';

export interface DayCalc {
  date: ISODate;
  entry?: ShiftEntry;
  type?: ShiftType;
  code: string;
  kind: DayKind | 'none';
  /** Effective segments (actual if overridden, otherwise planned). */
  segments: Segment[];
  /** Paid working minutes (segments − unpaid break). */
  workedMin: number;
  /** Break minutes: gaps between segments + declared unpaid break. */
  breakMin: number;
  nightMin: number;
  sundayMin: number;
  saturdayMin: number;
  /** Minutes worked on a public holiday. */
  holidayMin: number;
  /** Minutes credited for absences (vacation, sick…). */
  creditedMin: number;
  holiday?: string;
  unknown: boolean;
  customTimes: boolean;
}

export interface CalcOptions {
  nightStart: string;
  nightEnd: string;
  holidayOf: (iso: ISODate) => string | undefined;
}

export const DEFAULT_NIGHT = { nightStart: '23:00', nightEnd: '06:00' };

/** Night windows (minutes from a day's midnight) for a [start,end) definition that may wrap. */
function nightWindows(nightStart: string, nightEnd: string): [number, number][] {
  const s = parseHM(nightStart) ?? 1380;
  const e = parseHM(nightEnd) ?? 360;
  if (s === e) return [];
  return s > e ? [[0, e], [s, 1440]] : [[s, e]];
}

export function resolveEntry(entry: ShiftEntry | undefined, types: Record<string, ShiftType>) {
  const type = entry?.typeId ? types[entry.typeId] : undefined;
  const segments = entry?.segments?.length ? entry.segments : type?.segments ?? [];
  const kind: DayKind | 'none' = entry ? entry.kind ?? type?.kind ?? (segments.length ? 'work' : 'other') : 'none';
  const unpaidBreakMin = entry?.unpaidBreakMin ?? type?.unpaidBreakMin ?? 0;
  return { type, segments, kind, unpaidBreakMin };
}

export function computeDay(date: ISODate, entry: ShiftEntry | undefined, types: Record<string, ShiftType>, opts: CalcOptions): DayCalc {
  const { type, segments, kind, unpaidBreakMin } = resolveEntry(entry, types);
  const holiday = opts.holidayOf(date);
  const res: DayCalc = {
    date,
    entry,
    type,
    code: entry?.code || type?.code || '',
    kind,
    segments,
    workedMin: 0,
    breakMin: 0,
    nightMin: 0,
    sundayMin: 0,
    saturdayMin: 0,
    holidayMin: 0,
    creditedMin: 0,
    holiday,
    unknown: !!entry && !type && !entry.segments?.length && !entry.kind,
    customTimes: !!entry?.segments?.length,
  };
  if (!entry) return res;

  if (kind !== 'work' && kind !== 'training') {
    res.creditedMin = Math.round((type?.creditedHours ?? 0) * 60);
    return res;
  }

  const windows = nightWindows(opts.nightStart, opts.nightEnd);
  const intervals = toAbsoluteIntervals(segments);
  let gross = 0;
  for (const [s, e] of intervals) {
    gross += e - s;
    // Split at midnights so each piece is attributed to its calendar day.
    for (let dayStart = Math.floor(s / 1440) * 1440; dayStart < e; dayStart += 1440) {
      const a = Math.max(s, dayStart);
      const b = Math.min(e, dayStart + 1440);
      if (b <= a) continue;
      const pieceDate = addDays(date, dayStart / 1440);
      const len = b - a;
      if (isSunday(pieceDate)) res.sundayMin += len;
      if (isSaturday(pieceDate)) res.saturdayMin += len;
      if (opts.holidayOf(pieceDate)) res.holidayMin += len;
      for (const [w0, w1] of windows) res.nightMin += overlap(a - dayStart, b - dayStart, w0, w1);
    }
  }
  const unpaid = Math.min(unpaidBreakMin, gross);
  res.workedMin = gross - unpaid;
  res.breakMin = gapMinutes(segments) + unpaid;
  // Unpaid break is not taken from night/Sunday minutes, but they can never exceed the paid time.
  res.nightMin = Math.min(res.nightMin, res.workedMin);
  res.sundayMin = Math.min(res.sundayMin, res.workedMin);
  res.saturdayMin = Math.min(res.saturdayMin, res.workedMin);
  res.holidayMin = Math.min(res.holidayMin, res.workedMin);
  return res;
}

export interface WeekCalc {
  key: string;
  start: ISODate;
  end: ISODate;
  workedMin: number;
  overtimeMin: number;
  targetMin: number;
}

export interface PeriodSummary {
  start: ISODate;
  end: ISODate;
  days: DayCalc[];
  weeks: WeekCalc[];
  workedMin: number;
  creditedMin: number;
  nightMin: number;
  sundayMin: number;
  saturdayMin: number;
  holidayMin: number;
  overtimeMin: number;
  breakMin: number;
  targetMin: number;
  /** Worked + credited − target. */
  balanceMin: number;
  daysWorked: number;
  kindCounts: Record<DayKind, number>;
  typeCounts: Record<string, number>;
  unknownCodes: string[];
  plannedDays: number;
}

export interface SummaryOptions extends CalcOptions {
  weeklyHours: number;
  workDaysPerWeek: number;
  overtimeRule: 'none' | 'weekly' | 'daily';
  overtimeDailyHours: number;
}

/** Daily target: weekly hours spread over the first N weekdays, skipping public holidays. */
export function targetMinutesFor(date: ISODate, opts: SummaryOptions): number {
  if (!opts.weeklyHours || !opts.workDaysPerWeek) return 0;
  const wd = weekdayIndex(date);
  if (wd >= opts.workDaysPerWeek) return 0;
  if (opts.holidayOf(date)) return 0;
  return Math.round((opts.weeklyHours * 60) / opts.workDaysPerWeek);
}

export function summarize(
  start: ISODate,
  end: ISODate,
  entries: Record<ISODate, ShiftEntry>,
  types: Record<string, ShiftType>,
  opts: SummaryOptions,
): PeriodSummary {
  const kindCounts: Record<DayKind, number> = { work: 0, rest: 0, vacation: 0, sick: 0, holiday: 0, training: 0, other: 0 };
  const typeCounts: Record<string, number> = {};
  const unknown = new Set<string>();
  const days = eachDay(start, end).map((d) => computeDay(d, entries[d], types, opts));
  const weeksMap = new Map<string, WeekCalc>();
  const s: PeriodSummary = {
    start, end, days, weeks: [], workedMin: 0, creditedMin: 0, nightMin: 0, sundayMin: 0, saturdayMin: 0,
    holidayMin: 0, overtimeMin: 0, breakMin: 0, targetMin: 0, balanceMin: 0, daysWorked: 0,
    kindCounts, typeCounts, unknownCodes: [], plannedDays: 0,
  };
  for (const d of days) {
    const target = targetMinutesFor(d.date, opts);
    s.targetMin += target;
    const wk = weekKey(d.date);
    let w = weeksMap.get(wk);
    if (!w) {
      w = { key: wk, start: d.date, end: d.date, workedMin: 0, overtimeMin: 0, targetMin: 0 };
      weeksMap.set(wk, w);
    }
    w.end = d.date;
    w.targetMin += target;
    if (!d.entry) continue;
    s.plannedDays++;
    if (d.unknown) unknown.add(d.code);
    if (d.kind !== 'none') kindCounts[d.kind]++;
    if (d.type) typeCounts[d.type.id] = (typeCounts[d.type.id] ?? 0) + 1;
    s.workedMin += d.workedMin;
    s.creditedMin += d.creditedMin;
    s.nightMin += d.nightMin;
    s.sundayMin += d.sundayMin;
    s.saturdayMin += d.saturdayMin;
    s.holidayMin += d.holidayMin;
    s.breakMin += d.breakMin;
    if (d.workedMin > 0) s.daysWorked++;
    w.workedMin += d.workedMin + d.creditedMin;
    if (opts.overtimeRule === 'daily' && opts.overtimeDailyHours > 0) {
      const ot = Math.max(0, d.workedMin - opts.overtimeDailyHours * 60);
      w.overtimeMin += ot;
    }
  }
  for (const w of weeksMap.values()) {
    if (opts.overtimeRule === 'weekly' && opts.weeklyHours > 0) {
      // Prorate the weekly threshold for weeks cut by the period boundary.
      const daysInWeek = diffDays(w.start, w.end) + 1;
      const threshold = (opts.weeklyHours * 60 * Math.min(daysInWeek, 7)) / 7;
      w.overtimeMin = Math.max(0, Math.round(w.workedMin - threshold));
    }
    s.overtimeMin += w.overtimeMin;
    s.weeks.push(w);
  }
  s.balanceMin = s.workedMin + s.creditedMin - s.targetMin;
  s.unknownCodes = [...unknown].filter(Boolean);
  return s;
}
