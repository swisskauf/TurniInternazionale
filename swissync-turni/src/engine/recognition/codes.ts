import { extractTimeRanges } from '../time';
import type { CodeMapping, DayKind, Segment, ShiftType } from '../types';
import { confusableForm, levenshtein, normalizeCode } from './tokens';

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
    const times = extractTimeRanges(text);

    const withTimes = (type: ShiftType, status: CellStatus, confidence: number): CellResult => {
      const differs = times.length > 0 && JSON.stringify(times) !== JSON.stringify(type.segments);
      return { raw, code: type.code, typeId: type.id, segments: differs ? times : undefined, status, confidence };
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
