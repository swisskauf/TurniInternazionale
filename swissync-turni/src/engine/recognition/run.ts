import { makeISO } from '../dates';
import type { ISODate, RecognitionScript, ShiftType } from '../types';
import { createCellInterpreter, type CellResult } from './codes';
import {
  columnBounds, columnDates, findHeaders, nameScore, rowLabels, rowTokens, WEEKDAY_ABBR, type RowCandidate,
} from './grid';
import { detectPeriod, monthFromName, type PeriodGuess } from './period';
import { cx, groupLines, normalizeWords, stripAccents, type Line, type PlanDocument, type Token } from './tokens';

export interface RecognizedDay extends CellResult {
  date: ISODate;
}

export interface RecognitionContext {
  person: string;
  types: ShiftType[];
  /** Forces the month when the user picked it explicitly. */
  period?: { year: number; month: number };
}

export interface RecognitionResult {
  scriptId: string;
  layout: 'grid' | 'grid-rows' | 'list';
  period: PeriodGuess | null;
  people: string[];
  personLabel?: string;
  days: RecognizedDay[];
  /** 0..1, how much of what was found could be interpreted. */
  quality: number;
  issues: ('no-header' | 'no-person' | 'choose-person' | 'no-period' | 'no-days' | 'unknown-codes')[];
}

const MAX_DAYS = 62;

function finalize(res: RecognitionResult): RecognitionResult {
  // Deduplicate by date: keep the most confident interpretation.
  const byDate = new Map<ISODate, RecognizedDay>();
  for (const d of res.days) {
    const prev = byDate.get(d.date);
    if (!prev || d.confidence > prev.confidence) byDate.set(d.date, d);
  }
  res.days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(0, MAX_DAYS);
  const meaningful = res.days.filter((d) => d.status !== 'empty' || d.kind);
  const score = meaningful.reduce((s, d) => s + (d.status === 'ok' || d.status === 'times' ? 1 : d.status === 'fuzzy' ? 0.7 : d.status === 'empty' ? 0.6 : 0), 0);
  const volume = Math.min(1, meaningful.length / 7);
  res.quality = meaningful.length ? (score / meaningful.length) * volume : 0;
  if (!res.days.length && !res.issues.length) res.issues.push('no-days');
  if (res.days.some((d) => d.status === 'unknown')) res.issues.push('unknown-codes');
  return res;
}

function interpreterFor(script: RecognitionScript, ctx: RecognitionContext) {
  return createCellInterpreter({ types: ctx.types, codeMap: script.codeMap, ignore: script.ignore, emptyMeans: script.emptyMeans });
}

function resolvePeriod(doc: PlanDocument, ctx: RecognitionContext): PeriodGuess | null {
  if (ctx.period) return { ...ctx.period, confidence: 1, source: 'user' };
  return detectPeriod(doc.text, doc.hint);
}

// ---------------------------------------------------------------------------
// Grid: one row per person, one column per day
// ---------------------------------------------------------------------------

function runGrid(doc: PlanDocument, lines: Line[], script: RecognitionScript, ctx: RecognitionContext): RecognitionResult {
  const res: RecognitionResult = { scriptId: script.id, layout: 'grid', period: resolvePeriod(doc, ctx), people: [], days: [], quality: 0, issues: [] };
  const headers = findHeaders(lines, script.header);
  if (!headers.length) {
    res.issues.push('no-header');
    return res;
  }
  const interpret = interpreterFor(script, ctx);
  const person = script.personLabel || ctx.person;
  const people = new Set<string>();
  let matchedAny = false;
  let ambiguous = false;

  headers.forEach((h, hi) => {
    const headerLine = lines[h.lineIndex];
    let end = lines.length;
    for (let i = h.lineIndex + 1; i < lines.length; i++) {
      if (lines[i].page !== headerLine.page || (headers[hi + 1] && i >= headers[hi + 1].lineIndex)) {
        end = i;
        break;
      }
    }
    const cols = h.columns;
    const spacing = cols.length > 1 ? (cols[cols.length - 1].x - cols[0].x) / (cols.length - 1) : 40;
    const rows = rowLabels(lines, h.lineIndex, end, cols[0].x, spacing);
    rows.forEach((r) => people.add(r.label));

    let target: RowCandidate | undefined;
    let targetIdx = -1;
    if (person) {
      rows.forEach((r, i) => {
        r.score = nameScore(r.label, person, script.personAliases);
        if (r.score >= 0.5 && (!target || r.score > target.score)) {
          target = r;
          targetIdx = i;
        }
      });
      // Two colleagues matching equally well (e.g. two "Rossi"): let the user choose.
      if (target && target.score < 1.04 && rows.filter((r) => r.score === target!.score).length > 1) {
        ambiguous = true;
        target = undefined;
      }
    } else if (rows.length === 1) {
      target = rows[0];
      targetIdx = 0;
    }
    if (!target) return;
    matchedAny = true;
    res.personLabel = target.label;

    const needsPeriod = cols.some((c) => !c.month);
    if (needsPeriod && !res.period) return;
    const dates = columnDates(cols, res.period ?? { year: new Date().getFullYear(), month: 1 });
    const bounds = columnBounds(cols);
    const tokens = rowTokens(lines, rows, targetIdx, bounds[0][0]);
    const cells: Token[][] = cols.map(() => []);
    for (const t of tokens) {
      const x = cx(t);
      const idx = bounds.findIndex(([a, b]) => x >= a && x < b);
      if (idx >= 0) cells[idx].push(t);
    }
    cells.forEach((cellTokens, i) => {
      const date = dates[i];
      if (!date) return;
      const text = cellTokens.sort((a, b) => a.y - b.y || a.x - b.x).map((t) => t.text).join(' ');
      const r = interpret(text);
      if (r.status === 'empty' && !r.kind) return;
      res.days.push({ ...r, date });
    });
  });

  res.people = [...people];
  if (!res.period && headers.some((h) => h.columns.some((c) => !c.month))) res.issues.push('no-period');
  if (!matchedAny) res.issues.push(person && !ambiguous ? 'no-person' : 'choose-person');
  return finalize(res);
}

// ---------------------------------------------------------------------------
// Transposed grid: one row per day, one column per person
// ---------------------------------------------------------------------------

const ROW_DATE_RE = /^(?:(?:[a-zà-ü]{2,10})\.?,?\s*)?(\d{1,2})(?:[./-](\d{1,2})(?:[./-](\d{2,4}))?)?\.?$/i;

function rowDate(line: Line, maxX: number, period: PeriodGuess | null): ISODate | null {
  const left = line.tokens.filter((t) => cx(t) < maxX);
  if (!left.length) return null;
  const joined = left.map((t) => t.text).join(' ').trim();
  const iso = joined.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return makeISO(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const named = stripAccents(joined).toLowerCase().match(/(\d{1,2})\.?\s+([a-z]{3,9})\.?(?:\s+(\d{4}))?/);
  if (named && monthFromName(named[2])) {
    const y = named[3] ? Number(named[3]) : period?.year;
    if (y) return makeISO(y, monthFromName(named[2]), Number(named[1]));
  }
  for (const t of [...left].reverse()) {
    const m = t.text.trim().match(ROW_DATE_RE);
    if (!m) continue;
    const day = Number(m[1]);
    const month = m[2] ? Number(m[2]) : period?.month;
    const yRaw = m[3] ? Number(m[3]) : period?.year;
    const year = yRaw && yRaw < 100 ? 2000 + yRaw : yRaw;
    if (day && month && year) return makeISO(year, month, day);
  }
  return null;
}

function runGridRows(doc: PlanDocument, lines: Line[], script: RecognitionScript, ctx: RecognitionContext): RecognitionResult {
  const res: RecognitionResult = { scriptId: script.id, layout: 'grid-rows', period: resolvePeriod(doc, ctx), people: [], days: [], quality: 0, issues: [] };
  const person = script.personLabel || ctx.person;
  if (!person) {
    res.issues.push('choose-person');
    return res;
  }
  const interpret = interpreterFor(script, ctx);
  // Header line: the one where a token sequence matches the person name.
  let header: { line: number; x0: number; x1: number; nextX: number } | null = null;
  let bestScore = 0;
  lines.forEach((line, li) => {
    const toks = line.tokens;
    for (let i = 0; i < toks.length; i++) {
      for (let len = 1; len <= 3 && i + len <= toks.length; len++) {
        const group = toks.slice(i, i + len);
        const score = nameScore(group.map((t) => t.text).join(' '), person, script.personAliases);
        if (score >= 0.5 && score > bestScore && toks.length >= 3) {
          bestScore = score;
          const x0 = group[0].x;
          const x1 = group[group.length - 1].x + group[group.length - 1].w;
          const prev = toks[i - 1];
          const next = toks[i + len];
          header = { line: li, x0: prev ? (prev.x + prev.w + x0) / 2 : x0 - (x1 - x0), x1: next ? (x1 + next.x) / 2 : x1 + (x1 - x0), nextX: next ? next.x : x1 };
        }
      }
    }
  });
  if (!header) {
    res.issues.push('no-person');
    return res;
  }
  const h = header as { line: number; x0: number; x1: number };
  res.personLabel = person;
  res.people = lines[h.line].tokens.map((t) => t.text).filter((s) => /[a-zà-ü]{3,}/i.test(s));
  for (let i = h.line + 1; i < lines.length; i++) {
    const line = lines[i];
    const date = rowDate(line, h.x0, res.period);
    if (!date) continue;
    const cellTokens = line.tokens.filter((t) => cx(t) >= h.x0 && cx(t) < h.x1);
    const r = interpret(cellTokens.map((t) => t.text).join(' '));
    if (r.status === 'empty' && !r.kind) continue;
    res.days.push({ ...r, date });
  }
  return finalize(res);
}

// ---------------------------------------------------------------------------
// List: one line per day ("Lun 03.11  08:00-12:00 13:00-17:00", "2026-11-03 P1")
// ---------------------------------------------------------------------------

const WEEKDAY_LEAD = new RegExp(`^(?:${WEEKDAY_ABBR}|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica|monday|tuesday|wednesday|thursday|friday|saturday|sunday|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)[a-z]*\\.?,?\\s*`, 'i');

function parseListLine(text: string, script: RecognitionScript, period: PeriodGuess | null): { date: ISODate; rest: string } | null {
  if (script.linePattern) {
    try {
      const m = text.match(new RegExp(script.linePattern, 'i'));
      if (m?.groups) {
        const g = m.groups;
        const day = Number(g.day);
        const month = g.month ? (Number(g.month) || monthFromName(g.month)) : period?.month;
        let year = g.year ? Number(g.year) : period?.year;
        if (year && year < 100) year += 2000;
        if (day && month && year) {
          const date = makeISO(year, month, day);
          const rest = [g.code, g.start && g.end ? `${g.start}-${g.end}` : '', g.start2 && g.end2 ? `${g.start2}-${g.end2}` : '']
            .filter(Boolean).join(' ') || text.slice((m.index ?? 0) + m[0].length);
          if (date) return { date, rest };
        }
      }
    } catch {
      // Invalid pattern: fall back to the generic parser.
    }
  }
  const s = stripAccents(text).replace(WEEKDAY_LEAD, '');
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\b\s*[:\-–]?\s*(.*)$/);
  if (m) {
    const date = makeISO(Number(m[1]), Number(m[2]), Number(m[3]));
    return date ? { date, rest: m[4] } : null;
  }
  m = s.match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\.?(?!\d)\s*[:\-–]?\s*(.*)$/);
  if (m) {
    let a = Number(m[1]);
    let b = Number(m[2]);
    if (script.dateOrder === 'MDY') [a, b] = [b, a];
    let year = m[3] ? Number(m[3]) : period?.year;
    if (year && year < 100) year += 2000;
    if (!year) return null;
    const date = makeISO(year, b, a);
    return date ? { date, rest: m[4] } : null;
  }
  m = s.match(/^(\d{1,2})\.?\s+([a-z]{3,9})\.?(?:\s+(\d{4}))?\s*[:\-–]?\s*(.*)$/i);
  if (m && monthFromName(m[2])) {
    const year = m[3] ? Number(m[3]) : period?.year;
    if (!year) return null;
    const date = makeISO(year, monthFromName(m[2]), Number(m[1]));
    return date ? { date, rest: m[4] } : null;
  }
  // "Lun 3  P1" when the month comes from the heading.
  if (s !== stripAccents(text) && period) {
    m = s.match(/^(\d{1,2})\.?(?!\d|[:.]\d)\s*[:\-–]?\s*(.*)$/);
    if (m) {
      const date = makeISO(period.year, period.month, Number(m[1]));
      return date ? { date, rest: m[2] } : null;
    }
  }
  return null;
}

function runList(doc: PlanDocument, lines: Line[], script: RecognitionScript, ctx: RecognitionContext): RecognitionResult {
  const res: RecognitionResult = { scriptId: script.id, layout: 'list', period: resolvePeriod(doc, ctx), people: [], days: [], quality: 0, issues: [] };
  const interpret = interpreterFor(script, ctx);
  for (const line of lines) {
    // Lines are capped so a user/AI-provided pattern can't stall on huge input.
    const parsed = parseListLine(line.text.trim().slice(0, 300), script, res.period);
    if (!parsed) continue;
    const r = interpret(parsed.rest);
    if (r.status === 'empty') continue;
    res.days.push({ ...r, date: parsed.date });
  }
  return finalize(res);
}

// ---------------------------------------------------------------------------

export function runScript(doc: PlanDocument, script: RecognitionScript, ctx: RecognitionContext): RecognitionResult {
  const lines = groupLines(doc.tokens);
  if (script.layout === 'list') return runList(doc, lines, script, ctx);
  const grid = runGrid(doc, lines, script, ctx);
  if (grid.days.length || script.header !== 'auto') return grid;
  // No day header found: maybe the grid is transposed (days in rows).
  if (grid.issues.includes('no-header')) {
    const rows = runGridRows(doc, lines, script, ctx);
    if (rows.days.length) return rows;
  }
  return grid;
}

/** How well a document matches a script's fingerprint (0..1). Generic scripts score 0.3. */
export function fingerprint(doc: PlanDocument, script: RecognitionScript): number {
  if (!script.keywords.length) return 0.3;
  const text = normalizeWords(doc.text);
  const hits = script.keywords.filter((k) => {
    const n = normalizeWords(k);
    return n && text.includes(n);
  }).length;
  return hits / script.keywords.length;
}

export interface RankedResult {
  script: RecognitionScript;
  result: RecognitionResult;
  fingerprint: number;
  score: number;
}

/** Runs every candidate script and ranks them; the best one is what the import uses. */
export function recognize(doc: PlanDocument, scripts: RecognitionScript[], ctx: RecognitionContext): RankedResult[] {
  const ranked: RankedResult[] = [];
  for (const script of scripts) {
    const fp = fingerprint(doc, script);
    if (script.keywords.length && fp < 0.5) continue;
    const result = runScript(doc, script, ctx);
    const score = result.quality * (0.7 + 0.3 * fp) + (script.createdBy !== 'system' ? 0.02 : 0);
    ranked.push({ script, result, fingerprint: fp, score });
  }
  return ranked.sort((a, b) => b.score - a.score);
}

const STOP = new Set([
  'turni', 'turno', 'piano', 'orario', 'orari', 'mese', 'settimana', 'nome', 'cognome', 'totale', 'ore',
  'schedule', 'shift', 'shifts', 'plan', 'month', 'week', 'name', 'total', 'hours',
  'dienstplan', 'schicht', 'monat', 'woche', 'stunden', 'planning', 'horaire', 'semaine', 'heures', 'mois',
]);

/** Distinctive words of a plan (title area), used as the fingerprint of a new script. */
export function extractKeywords(doc: PlanDocument, person: string, max = 5): string[] {
  const lines = groupLines(doc.tokens);
  const headers = findHeaders(lines, 'auto');
  const titleLines = headers.length ? lines.slice(0, headers[0].lineIndex) : lines.slice(0, 4);
  const personParts = new Set(normalizeWords(person).split(' '));
  const words: string[] = [];
  for (const l of titleLines) {
    for (const w of normalizeWords(l.text).split(' ')) {
      if (w.length < 4 || /\d/.test(w) || STOP.has(w) || personParts.has(w) || monthFromName(w)) continue;
      if (new RegExp(`^(${WEEKDAY_ABBR})$`).test(w)) continue;
      if (!words.includes(w)) words.push(w);
    }
  }
  return words.slice(0, max);
}
