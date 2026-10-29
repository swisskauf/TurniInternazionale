import { makeISO } from '../dates';
import type { ISODate } from '../types';
import { monthFromName } from './period';
import { cx, cy, levenshtein, normalizeWords, type Line, type Token } from './tokens';

export interface Column {
  day: number;
  /** Explicit month/year when the header carries full dates. */
  month?: number;
  year?: number;
  x: number;
  /** Estimated: inserted where OCR missed a header number. */
  synthetic?: boolean;
}

export interface HeaderCandidate {
  lineIndex: number;
  columns: Column[];
  kind: 'day-numbers' | 'dates';
}

export const WEEKDAY_ABBR = 'lun|mar|mer|gio|ven|sab|dom|lu|ma|me|gi|ve|sa|do|mon|tue|wed|thu|fri|sat|sun|mo|tu|we|th|fr|su|di|mi|so|jeu|sam|dim|je';
const DAY_RE = new RegExp(`^(?:(?:${WEEKDAY_ABBR})\\.?)?0?([1-9]|[12]\\d|3[01])\\.?(?:(?:${WEEKDAY_ABBR})\\.?)?$`, 'i');
const DATE_RE = /^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\.?$/;
const DATE_NAME_RE = /^(\d{1,2})\.?\s*([a-zà-ü]{3,9})\.?$/i;

function dayToken(t: Token, mode: 'day-numbers' | 'dates'): Omit<Column, 'x'> | null {
  const s = t.text.trim();
  if (mode === 'dates') {
    let m = s.match(DATE_RE);
    if (m) {
      const day = Number(m[1]);
      const month = Number(m[2]);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : undefined;
        return { day, month, year };
      }
    }
    m = s.match(DATE_NAME_RE);
    if (m) {
      const month = monthFromName(m[2]);
      const day = Number(m[1]);
      if (month && day >= 1 && day <= 31) return { day, month };
    }
    return null;
  }
  const m = s.match(DAY_RE);
  if (!m) return null;
  return { day: Number(m[1]) };
}

/** Longest left-to-right run of consecutive day numbers in a line (tolerating one missed day). */
function bestRun(tokens: Token[], mode: 'day-numbers' | 'dates'): Column[] {
  const cands = tokens
    .map((t) => {
      const d = dayToken(t, mode);
      return d ? { ...d, x: cx(t) } : null;
    })
    .filter((c): c is Column => !!c)
    .sort((a, b) => a.x - b.x);
  let best: Column[] = [];
  for (let i = 0; i < cands.length; i++) {
    const run: Column[] = [cands[i]];
    let wraps = 0;
    for (let j = i + 1; j < cands.length; j++) {
      const prev = run[run.length - 1];
      const cur = cands[j];
      if (cur.day === prev.day + 1) run.push(cur);
      else if (cur.day === prev.day + 2) {
        run.push({ day: prev.day + 1, month: prev.month, year: prev.year, x: (prev.x + cur.x) / 2, synthetic: true });
        run.push(cur);
      } else if (cur.day === 1 && prev.day >= 28 && wraps === 0) {
        wraps++;
        run.push(cur);
      } else if (cur.day === prev.day) continue;
      else break;
    }
    if (run.length > best.length) best = run;
  }
  return best;
}

export function findHeaders(lines: Line[], header: 'auto' | 'day-numbers' | 'dates'): HeaderCandidate[] {
  const modes: ('day-numbers' | 'dates')[] = header === 'auto' ? ['dates', 'day-numbers'] : [header];
  const found: HeaderCandidate[] = [];
  lines.forEach((line, lineIndex) => {
    let best: HeaderCandidate | null = null;
    for (const mode of modes) {
      const run = bestRun(line.tokens, mode);
      if (run.length >= 5 && (!best || run.length > best.columns.length)) best = { lineIndex, columns: run, kind: mode };
    }
    if (best) found.push(best);
  });
  // Keep the strongest header per page section; drop weaker lines right below a header (e.g. a
  // second numeric row like hours) that would split the section.
  const kept: HeaderCandidate[] = [];
  for (const h of found) {
    const last = kept[kept.length - 1];
    if (last && h.lineIndex - last.lineIndex <= 2 && lines[h.lineIndex].page === lines[last.lineIndex].page) {
      if (h.columns.length > last.columns.length) kept[kept.length - 1] = h;
      continue;
    }
    kept.push(h);
  }
  return kept;
}

/** Assigns calendar dates to header columns, rolling the month over when day numbers wrap. */
export function columnDates(columns: Column[], period: { year: number; month: number }): (ISODate | null)[] {
  const wrapIndex = columns.findIndex((c, i) => i > 0 && c.day < columns[i - 1].day);
  let startYear = period.year;
  let startMonth = period.month;
  if (wrapIndex > 0) {
    // Assign the detected month to the side with most days.
    const before = wrapIndex;
    const after = columns.length - wrapIndex;
    if (after > before) {
      startMonth -= 1;
      if (startMonth === 0) {
        startMonth = 12;
        startYear -= 1;
      }
    }
  }
  return columns.map((c, i) => {
    if (c.month) return makeISO(c.year ?? period.year, c.month, c.day);
    let y = startYear;
    let m = startMonth;
    if (wrapIndex > 0 && i >= wrapIndex) {
      m += 1;
      if (m === 13) {
        m = 1;
        y += 1;
      }
    }
    return makeISO(y, m, c.day);
  });
}

export function columnBounds(columns: Column[]): [number, number][] {
  return columns.map((c, i) => {
    const prev = columns[i - 1];
    const next = columns[i + 1];
    const spacingL = prev ? c.x - prev.x : next ? next.x - c.x : 40;
    const spacingR = next ? next.x - c.x : spacingL;
    return [c.x - spacingL / 2, c.x + spacingR / 2];
  });
}

export function nameScore(label: string, person: string, aliases: string[] = []): number {
  const labelWords = normalizeWords(label).split(' ').filter(Boolean);
  if (!labelWords.length) return 0;
  let best = 0;
  for (const target of [person, ...aliases]) {
    const parts = normalizeWords(target).split(' ').filter((p) => p.length >= 2);
    if (!parts.length) continue;
    let hit = 0;
    const used = new Set<number>();
    for (const p of parts) {
      const idx = labelWords.findIndex((w, i) => !used.has(i) && (w === p || (p.length >= 4 && levenshtein(w, p) <= 1) || (w.length >= 4 && p.startsWith(w)) || (p.length >= 4 && w.startsWith(p))));
      if (idx >= 0) {
        used.add(idx);
        hit++;
        continue;
      }
      // "ROSSI M." — an initial counts as a partial match.
      const initial = labelWords.findIndex((w, i) => !used.has(i) && w.length === 1 && p.startsWith(w));
      if (initial >= 0) {
        used.add(initial);
        hit += 0.6;
      }
    }
    const score = hit / parts.length;
    // A full-label match (label equals the name) scores higher than a partial one.
    const bonus = hit === parts.length && labelWords.length === parts.length ? 0.05 : 0;
    best = Math.max(best, score + bonus);
  }
  return best;
}

export interface RowCandidate {
  lineIndex: number;
  label: string;
  score: number;
}

const HAS_LETTERS = /[a-zà-ü]{3,}/i;

/** Row labels (left of the first day column) below a header, i.e. the people in the grid. */
export function rowLabels(lines: Line[], headerLine: number, endLine: number, firstX: number, spacing: number): RowCandidate[] {
  const out: RowCandidate[] = [];
  for (let i = headerLine + 1; i < endLine; i++) {
    const labelTokens = lines[i].tokens.filter((t) => cx(t) < firstX - spacing * 0.6);
    const label = labelTokens.map((t) => t.text).join(' ').trim();
    if (label && HAS_LETTERS.test(label)) out.push({ lineIndex: i, label, score: 0 });
  }
  return out;
}

/** Tokens of a person's row: from its line down to (excluding) the next labelled row. */
export function rowTokens(lines: Line[], rows: RowCandidate[], rowIdx: number, minX: number): Token[] {
  const row = rows[rowIdx];
  const line = lines[row.lineIndex];
  const top = line.y - line.h * 0.6;
  const nextRow = rows[rowIdx + 1];
  const limit = line.y + line.h * 3.2;
  const bottom = nextRow ? Math.min(lines[nextRow.lineIndex].y - lines[nextRow.lineIndex].h * 0.6, limit) : limit;
  const out: Token[] = [];
  for (let i = row.lineIndex; i < lines.length; i++) {
    const l = lines[i];
    if (l.page !== line.page) break;
    if (l.y > bottom) break;
    for (const t of l.tokens) {
      if (cy(t) >= top && cy(t) < bottom && cx(t) >= minX) out.push(t);
    }
  }
  return out;
}
