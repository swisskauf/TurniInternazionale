import { diffDays, makeISO } from '../dates';
import type { ISODate } from '../types';
import { stripAccents } from './tokens';

const MONTHS: Record<string, number> = {};
const NAMES: string[][] = [
  // it
  ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'],
  ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'],
  // en
  ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'],
  ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'],
  // de
  ['januar', 'februar', 'marz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'],
  ['jan', 'feb', 'mrz', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dez'],
  ['janner', 'feber', 'maerz', '', '', '', '', '', 'sept', '', '', ''],
  // fr
  ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'],
  ['janv', 'fevr', 'mars', 'avr', 'mai', 'juin', 'juil', 'aout', 'sept', 'oct', 'nov', 'dec'],
];
for (const list of NAMES) list.forEach((n, i) => { if (n && !(n in MONTHS)) MONTHS[n] = i + 1; });

/** Month number for a (possibly abbreviated) month name in it/en/de/fr, or 0. */
export function monthFromName(word: string): number {
  const w = stripAccents(word).toLowerCase().replace(/[^a-z]/g, '');
  return MONTHS[w] ?? 0;
}

const MONTH_ALT = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');

export interface PeriodGuess {
  year: number;
  month: number;
  confidence: number;
  source: string;
}

function fixYear(y: number): number {
  if (y < 100) return 2000 + y;
  return y;
}

function plausibleYear(y: number): boolean {
  return y >= 2000 && y <= 2100;
}

/**
 * Detects the month a plan refers to from its text. Prefers "Novembre 2026" style headings,
 * then numeric month/year, then the most frequent month among full dates.
 */
export function detectPeriod(rawText: string, fallback?: { year?: number; month?: number }): PeriodGuess | null {
  const text = stripAccents(rawText).toLowerCase();
  const candidates: (PeriodGuess & { index: number })[] = [];

  const named = new RegExp(`(?<![a-z])(${MONTH_ALT})\\.?\\s*[,/.\\-]?\\s*('?\\d{2}|\\d{4})(?!\\d)`, 'g');
  for (const m of text.matchAll(named)) {
    const month = MONTHS[m[1]];
    const y = fixYear(Number(m[2].replace("'", '')));
    if (month && plausibleYear(y)) candidates.push({ year: y, month, confidence: m[1].length >= 4 ? 0.95 : 0.8, source: m[0], index: m.index ?? 0 });
  }

  const numeric = /(?<![\d./-])(\d{1,2})[./-](\d{4})(?![\d./-])/g;
  for (const m of text.matchAll(numeric)) {
    const month = Number(m[1]);
    const y = Number(m[2]);
    if (month >= 1 && month <= 12 && plausibleYear(y)) candidates.push({ year: y, month, confidence: 0.75, source: m[0], index: m.index ?? 0 });
  }

  const isoYm = /(?<![\d./-])(\d{4})[./-](\d{1,2})(?![\d])(?![./-]\d)/g;
  for (const m of text.matchAll(isoYm)) {
    const y = Number(m[1]);
    const month = Number(m[2]);
    if (month >= 1 && month <= 12 && plausibleYear(y)) candidates.push({ year: y, month, confidence: 0.7, source: m[0], index: m.index ?? 0 });
  }

  if (candidates.length) {
    candidates.sort((a, b) => b.confidence - a.confidence || a.index - b.index);
    const { index: _i, ...best } = candidates[0];
    return best;
  }

  // Full dates: take the most frequent month.
  const counts = new Map<string, number>();
  const full = /(?<!\d)(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})(?!\d)/g;
  const dates = [...text.matchAll(full)].map((m) => ({ month: Number(m[2]), y: fixYear(Number(m[3])), long: m[3].length === 4 }));
  // "05.10.20" in a narrow column is "05.10.2026" cut off, not 2020: trust 4-digit years first.
  const longYears = new Set(dates.filter((d) => d.long).map((d) => d.y));
  for (const { month, y, long } of dates) {
    if (!long && longYears.size && !longYears.has(y)) continue;
    if (month >= 1 && month <= 12 && plausibleYear(y)) {
      const k = `${y}-${month}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  if (counts.size) {
    const [k] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const [y, month] = k.split('-').map(Number);
    return { year: y, month, confidence: 0.6, source: 'dates' };
  }

  // A month name alone: borrow the year from the fallback (or the current year).
  const alone = new RegExp(`(?<![a-z])(${Object.keys(MONTHS).filter((k) => k.length >= 4).join('|')})(?![a-z])`);
  const m = text.match(alone);
  if (m) {
    const year = fallback?.year ?? new Date().getFullYear();
    return { year, month: MONTHS[m[1]], confidence: 0.45, source: m[0] };
  }

  if (fallback?.year && fallback?.month) return { year: fallback.year, month: fallback.month, confidence: 0.3, source: 'hint' };
  return null;
}

export interface DateRange {
  start: ISODate;
  end: ISODate;
}

/** "05.10.2026 - 25.10.2026", "dal 5.10.26 al 25.10.26": the spans a plan's title states. */
export function detectRanges(rawText: string): DateRange[] {
  const out: DateRange[] = [];
  const text = stripAccents(rawText).toLowerCase();
  // OCR may insert a space next to a separator ("08.11 .2026").
  const re = /(?<![\d.])(\d{1,2}) ?[./-] ?(\d{1,2}) ?[./-] ?(\d{4}|\d{2})(?!\d)\s*(?:-|–|—|al|bis|au|to|a)\s*(\d{1,2}) ?[./-] ?(\d{1,2}) ?[./-] ?(\d{4}|\d{2})(?!\d)/g;
  for (const m of text.matchAll(re)) {
    const start = makeISO(fixYear(Number(m[3])), Number(m[2]), Number(m[1]));
    const end = makeISO(fixYear(Number(m[6])), Number(m[5]), Number(m[4]));
    if (!start || !end) continue;
    const span = diffDays(start, end);
    if (span >= 1 && span <= 62) out.push({ start, end });
  }
  return out;
}

/** The first date range stated in a plan's text. */
export function detectRange(rawText: string): DateRange | null {
  return detectRanges(rawText)[0] ?? null;
}
