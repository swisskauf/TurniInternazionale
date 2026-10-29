import { extractTimeRanges, fmtHM, parseHM } from '../time';
import type { CodeMapping, DayKind, Segment, ShiftType } from '../types';
import { confusableForm, levenshtein, normalizeCode } from './tokens';

const mins = (hm: string) => parseHM(hm) ?? 0;
const totalMinutes = (list: Segment[]) => list.reduce((sum, x) => sum + ((mins(x.end) - mins(x.start) + 1440) % 1440 || 1440), 0);

/**
 * Time ranges written in a cell. OCR sometimes loses the dash of a range ("05:00 08:00
 * 08:00 - 12:00"): an even list of times is then read as consecutive pairs.
 */
export function cellTimes(text: string): Segment[] {
  const ranges = extractTimeRanges(text);
  const all = [...text.matchAll(/(?<![\d:.])(\d{1,2}[:.]\d{2})(?![\d:.])/g)].map((m) => parseHM(m[1]));
  if (all.length < 2 || all.length % 2 || ranges.length * 2 >= all.length || all.some((v) => v == null)) return ranges;
  const pairs: Segment[] = [];
  for (let i = 0; i < all.length; i += 2) {
    if (all[i] === all[i + 1]) return ranges;
    pairs.push({ start: fmtHM(all[i]!), end: fmtHM(all[i + 1]!) });
  }
  return pairs;
}

/**
 * Times written in a cell replace the shift's hours, but keep the shift's own breaks when the
 * written times only join the pieces around them: R+P1 = 05:00-07:30, 08:00-12:00 … written as
 * "05:00-08:00 08:00-12:00" still has its 07:30-08:00 break.
 */
export function keepTypeBreaks(times: Segment[], type: Segment[]): Segment[] {
  const bounds = new Set(type.flatMap((s) => [mins(s.start), mins(s.end)]));
  const breaks = type.slice(1).map((s, i) => ({ start: mins(type[i].end), end: mins(s.start) })).filter((b) => b.end > b.start);
  return times.flatMap((t) => {
    const a = mins(t.start);
    const z = mins(t.end);
    if (z <= a || !bounds.has(a) || !bounds.has(z)) return [t];
    const inside = breaks.filter((b) => b.start > a && b.end <= z);
    if (!inside.length) return [t];
    const out: Segment[] = [];
    let cur = a;
    for (const b of inside) {
      if (b.start > cur) out.push({ start: fmtHM(cur), end: fmtHM(b.start) });
      cur = b.end;
    }
    if (z > cur) out.push({ start: fmtHM(cur), end: fmtHM(z) });
    return out;
  });
}

export type CellStatus = 'ok' | 'fuzzy' | 'unknown' | 'times' | 'empty';

export interface CellResult {
  raw: string;
  code: string;
  typeId?: string;
  segments?: Segment[];
  kind?: DayKind;
  status: CellStatus;
  confidence: number;
}

export interface CodeMatcherOptions {
  types: ShiftType[];
  codeMap: CodeMapping[];
  ignore: string[];
  emptyMeans: 'rest' | 'skip';
}

/** Turns the raw text of a plan cell into a known shift type, custom times, or an unknown code. */
export function createCellInterpreter(opts: CodeMatcherOptions) {
  const exact = new Map<string, ShiftType>();
  const confusable = new Map<string, ShiftType[]>();
  const active = opts.types.filter((t) => !t.archived);
  for (const t of active) {
    for (const key of [t.code, ...t.aliases]) {
      const k = normalizeCode(key);
      if (!k) continue;
      if (!exact.has(k)) exact.set(k, t);
      const c = confusableForm(k);
      const list = confusable.get(c) ?? [];
      if (!list.includes(t)) list.push(t);
      confusable.set(c, list);
    }
  }
  const mapping = new Map<string, string>();
  for (const m of opts.codeMap) {
    const from = normalizeCode(m.from);
    if (from) mapping.set(from, normalizeCode(m.to));
  }
  const ignore = new Set(opts.ignore.map(normalizeCode).filter(Boolean));

  const lookupExact = (k: string): ShiftType | undefined => {
    const hit = exact.get(mapping.get(k) ?? k);
    if (hit) return hit;
    // Plans mark changed/special days with a trailing sign ("R+P1*"): same shift type.
    const unmarked = k.replace(/^[*°^]+|[*°^]+$/g, '');
    return unmarked && unmarked !== k ? exact.get(mapping.get(unmarked) ?? unmarked) : undefined;
  };

  const lookupFuzzy = (k: string): { type: ShiftType; confidence: number } | undefined => {
    const mapped = mapping.get(k) ?? k;
    const byConf = confusable.get(confusableForm(mapped));
    if (byConf && byConf.length === 1) return { type: byConf[0], confidence: 0.8 };
    if (mapped.length >= 3) {
      let best: ShiftType | undefined;
      let ambiguous = false;
      for (const [key, t] of exact) {
        if (Math.abs(key.length - mapped.length) > 1) continue;
        if (levenshtein(key, mapped) === 1) {
          if (best && best !== t) ambiguous = true;
          best = t;
        }
      }
      if (best && !ambiguous) return { type: best, confidence: 0.6 };
    }
    return undefined;
  };

  return function interpret(rawText: string): CellResult {
    const raw = rawText.replace(/\s+/g, ' ').trim();
    const words = raw.split(' ').filter((w) => w && !ignore.has(normalizeCode(w)));
    const text = words.join(' ');
    if (!text) {
      return opts.emptyMeans === 'rest'
        ? { raw, code: '', kind: 'rest', status: 'empty', confidence: 0.7 }
        : { raw, code: '', status: 'empty', confidence: 0 };
    }

    const whole = normalizeCode(text);
    const times = cellTimes(text);

    const withTimes = (type: ShiftType, status: CellStatus, confidence: number): CellResult => {
      const own = times.length ? keepTypeBreaks(times, type.segments) : times;
      const differs = own.length > 0 && JSON.stringify(own) !== JSON.stringify(type.segments);
      if (!differs) return { raw, code: type.code, typeId: type.id, status, confidence };
      // Written hours replace the shift's only when they look like a whole shift: OCR often reads
      // just one line of a two-line cell, or swaps two times.
      const planned = totalMinutes(type.segments);
      const written = totalMinutes(own);
      const overnight = (list: Segment[]) => list.some((x) => mins(x.end) <= mins(x.start));
      const plausible = !planned || (written >= 0.5 * planned && written <= 1.5 * planned && (overnight(type.segments) || !overnight(own)));
      if (plausible) return { raw, code: type.code, typeId: type.id, segments: own, status, confidence };
      return { raw, code: type.code, typeId: type.id, status: 'fuzzy', confidence: Math.min(confidence, 0.6) };
    };

    let t = lookupExact(whole);
    if (t) return withTimes(t, 'ok', 1);

    // A word of the cell matches exactly (e.g. "P1 *" or "P1 08:00-17:00").
    for (const w of words) {
      t = lookupExact(normalizeCode(w));
      if (t) return withTimes(t, 'ok', 0.95);
    }

    if (times.length) {
      return { raw, code: times.map((s) => `${s.start}-${s.end}`).join(' '), segments: times, kind: 'work', status: 'times', confidence: 0.9 };
    }

    const fz = lookupFuzzy(whole) ?? words.map((w) => lookupFuzzy(normalizeCode(w))).find(Boolean);
    if (fz) return withTimes(fz.type, 'fuzzy', fz.confidence);

    const mappedWhole = mapping.get(whole);
    return { raw, code: (mappedWhole ?? whole).slice(0, 16), status: 'unknown', confidence: 0.2 };
  };
}
