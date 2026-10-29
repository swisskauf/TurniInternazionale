import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createHolidayLookup } from '@/engine/holidays';
import { computeDay, summarize, type CalcOptions, type SummaryOptions } from '@/engine/hours';
import { todayISO } from '@/engine/dates';
import type { ISODate } from '@/engine/types';
import { useStore } from '@/store/store';

export function useHolidayLookup() {
  const country = useStore((s) => s.profile.country);
  const region = useStore((s) => s.profile.region);
  const customHolidays = useStore((s) => s.profile.customHolidays);
  const ignoredHolidays = useStore((s) => s.profile.ignoredHolidays);
  return useMemo(() => createHolidayLookup({ country, region, customHolidays, ignoredHolidays }), [country, region, customHolidays, ignoredHolidays]);
}

export function useCalcOptions(): SummaryOptions {
  const holidayOf = useHolidayLookup();
  const sp = useStore((s) => s.pay.supplements);
  const weeklyHours = useStore((s) => s.profile.weeklyHours);
  const workDaysPerWeek = useStore((s) => s.profile.workDaysPerWeek);
  return useMemo(
    () => ({
      holidayOf,
      nightStart: sp.nightStart || '23:00',
      nightEnd: sp.nightEnd || '06:00',
      weeklyHours,
      workDaysPerWeek,
      overtimeRule: sp.overtimeRule,
      overtimeDailyHours: sp.overtimeDailyHours,
    }),
    [holidayOf, sp.nightStart, sp.nightEnd, sp.overtimeRule, sp.overtimeDailyHours, weeklyHours, workDaysPerWeek],
  );
}

export function useSummary(start: ISODate, end: ISODate) {
  const entries = useStore((s) => s.entries);
  const types = useStore((s) => s.types);
  const opts = useCalcOptions();
  return useMemo(() => summarize(start, end, entries, types, opts), [start, end, entries, types, opts]);
}

export function useDayCalc(date: ISODate) {
  const entry = useStore((s) => s.entries[date]);
  const types = useStore((s) => s.types);
  const opts = useCalcOptions();
  return useMemo(() => computeDay(date, entry, types, opts as CalcOptions), [date, entry, types, opts]);
}

/** Current time, refreshed every `ms`. */
export function useNow(ms = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    const onVis = () => document.visibilityState === 'visible' && setNow(new Date());
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [ms]);
  return now;
}

export function useToday(): ISODate {
  const now = useNow(60_000);
  return todayISO(now);
}

function subscribeDark(cb: () => void) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

/** Applies the theme class to <html> and returns whether dark mode is active. */
export function useThemeEffect(): boolean {
  const theme = useStore((s) => s.profile.theme);
  const systemDark = useSyncExternalStore(subscribeDark, () => window.matchMedia('(prefers-color-scheme: dark)').matches, () => false);
  const dark = theme === 'dark' || (theme === 'system' && systemDark);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#080b11' : '#f3f4f7');
  }, [dark]);
  return dark;
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
