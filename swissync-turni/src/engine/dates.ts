import type { ISODate } from './types';

export function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fromISO(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function isISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = fromISO(s);
  return toISO(d) === s;
}

export function makeISO(year: number, month: number, day: number): ISODate | null {
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return toISO(d);
}

export function todayISO(now = new Date()): ISODate {
  return toISO(now);
}

export function addDays(iso: ISODate, n: number): ISODate {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function addMonths(iso: ISODate, n: number): ISODate {
  const d = fromISO(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISO(d);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86400000);
}

/** Inclusive list of dates from `start` to `end`. */
export function eachDay(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  if (start > end) return out;
  let cur = start;
  let guard = 0;
  while (cur <= end && guard++ < 4000) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(iso: ISODate): number {
  return (fromISO(iso).getDay() + 6) % 7;
}

export function isSunday(iso: ISODate): boolean {
  return fromISO(iso).getDay() === 0;
}

export function isSaturday(iso: ISODate): boolean {
  return fromISO(iso).getDay() === 6;
}

export function isoWeek(iso: ISODate): { year: number; week: number } {
  const d = fromISO(iso);
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: date.getUTCFullYear(), week };
}

export function weekKey(iso: ISODate): string {
  const { year, week } = isoWeek(iso);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function startOfWeek(iso: ISODate): ISODate {
  return addDays(iso, -weekdayIndex(iso));
}

export function monthKey(iso: ISODate): string {
  return iso.slice(0, 7);
}

export function monthRange(year: number, month: number): { start: ISODate; end: ISODate } {
  const last = new Date(year, month, 0).getDate();
  return {
    start: `${year}-${String(month).padStart(2, '0')}-01`,
    end: `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
  };
}

/**
 * Pay period containing `iso`. With startDay 1 it is the calendar month; with e.g. 21 it runs
 * 21st → 20th of the next month and is labelled by the month it ends in.
 */
export function payPeriodFor(iso: ISODate, startDay: number): { start: ISODate; end: ISODate; label: string } {
  const sd = Math.min(Math.max(Math.round(startDay) || 1, 1), 28);
  const d = fromISO(iso);
  if (sd === 1) {
    const r = monthRange(d.getFullYear(), d.getMonth() + 1);
    return { ...r, label: monthKey(iso) };
  }
  let y = d.getFullYear();
  let m = d.getMonth() + 1;
  if (d.getDate() < sd) {
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  const start = makeISO(y, m, sd)!;
  const end = addDays(addMonths(start, 1), -1);
  return { start, end, label: monthKey(end) };
}

/** The pay period labelled with month `YYYY-MM`. */
export function payPeriodByLabel(label: string, startDay: number): { start: ISODate; end: ISODate; label: string } {
  const [y, m] = label.split('-').map(Number);
  if (startDay <= 1) return { ...monthRange(y, m), label };
  const end = makeISO(y, m, Math.min(startDay - 1, 28))!;
  return payPeriodFor(end, startDay);
}

export function shiftMonthLabel(label: string, n: number): string {
  const [y, m] = label.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Calendar grid (weeks starting Monday) covering a month, padded with neighbouring days. */
export function monthGrid(year: number, month: number): ISODate[][] {
  const { start, end } = monthRange(year, month);
  const gridStart = startOfWeek(start);
  const gridEnd = addDays(startOfWeek(end), 6);
  const days = eachDay(gridStart, gridEnd);
  const weeks: ISODate[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

export function fmtDateCH(iso: ISODate): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}
