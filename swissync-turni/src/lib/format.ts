import { format as dfFormat } from 'date-fns';
import { de, enGB, fr, it } from 'date-fns/locale';
import { useMemo } from 'react';
import { fromISO } from '@/engine/dates';
import { fmtHours } from '@/engine/time';
import type { Country, HoursFormat, ISODate, Locale } from '@/engine/types';
import { useStore } from '@/store/store';

const DF = { it, en: enGB, de, fr };

export function dateLocale(locale: Locale) {
  return DF[locale] ?? it;
}

export function intlLocale(locale: Locale, country: Country): string {
  return country === 'CH' ? `${locale}-CH` : locale === 'en' ? 'en-GB' : locale;
}

export function formatDate(iso: ISODate, pattern: string, locale: Locale): string {
  const s = dfFormat(fromISO(iso), pattern, { locale: dateLocale(locale) });
  return s;
}

export const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function formatMoney(amount: number, currency: string, locale: Locale, country: Country, opts: { sign?: boolean } = {}): string {
  let body: string;
  try {
    body = new Intl.NumberFormat(intlLocale(locale, country), {
      style: 'currency',
      currency: currency || 'CHF',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(opts.sign ? Math.abs(amount) : amount);
  } catch {
    body = `${currency} ${(opts.sign ? Math.abs(amount) : amount).toFixed(2)}`;
  }
  // Explicit sign in front ("+ CHF 12.50"), which reads better than "CHF+12.50".
  if (opts.sign && Math.abs(amount) >= 0.005) return `${amount > 0 ? '+' : '−'} ${body}`;
  return body;
}

export function formatNumber(value: number, locale: Locale, country: Country, digits = 2): string {
  return new Intl.NumberFormat(intlLocale(locale, country), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

/** Human duration "2h 15m" / "45 min" for countdowns. */
export function formatCountdown(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `${d}g ${h % 24}h`;
  }
  return r ? `${h}h ${String(r).padStart(2, '0')}m` : `${h}h`;
}

export function useFmt() {
  const locale = useStore((s) => s.profile.locale);
  const country = useStore((s) => s.profile.country);
  const hoursFormat = useStore((s) => s.profile.hoursFormat) as HoursFormat;
  const currency = useStore((s) => s.pay.currency);
  return useMemo(
    () => ({
      locale,
      hours: (h: number, opts?: { zero?: string; unit?: boolean }) => fmtHours(h, hoursFormat, opts),
      minutes: (min: number, opts?: { zero?: string; unit?: boolean }) => fmtHours(min / 60, hoursFormat, opts),
      money: (v: number, opts?: { sign?: boolean; currency?: string }) => formatMoney(v, opts?.currency ?? currency, locale, country, opts),
      number: (v: number, digits = 2) => formatNumber(v, locale, country, digits),
      date: (iso: ISODate, pattern = 'd MMM yyyy') => formatDate(iso, pattern, locale),
      dateCap: (iso: ISODate, pattern: string) => capitalize(formatDate(iso, pattern, locale)),
    }),
    [locale, country, hoursFormat, currency],
  );
}
