import { extractTimeRanges, fmtHM, parseHM } from './time';
import { groupLines, normalizeCode, normalizeWords, type Token } from './recognition/tokens';
import type { DayKind, Segment } from './types';

export interface LegendDraft {
  code: string;
  name: string;
  kind: DayKind;
  segments: Segment[];
  unpaidBreakMin: number;
}

const KIND_WORDS: [DayKind, RegExp][] = [
  ['rest', /\b(riposo|libero|free|frei|off|repos|day off|ruhetag|congedo settimanale)\b/],
  ['vacation', /\b(ferie|vacanz\w*|vacation|holiday leave|urlaub|ferien|conge|conges|vacances)\b/],
  ['sick', /\b(malatti\w*|sick\w*|krank\w*|maladie|infortunio|unfall|accident)\b/],
  ['holiday', /\b(festiv\w*|feiertag|ferie)\b/],
  ['training', /\b(formazione|corso|training|schulung|weiterbildung|formation|cours)\b/],
];

const BREAK_LABEL = /(?:pausa|pause|break|pausen?)\W{0,3}$/i;
const LABELS = /\b(?:orario(?: di lavoro)?|arbeitszeit|horaire(?: de travail)?|working hours|hours|pausa|pause|break|ore|von|dalle|alle|de|à)\b\s*:?/gi;

function toMin(hm: string): number {
  return parseHM(hm) ?? 0;
}

/**
 * Removes break windows from work windows:
 * work 08:00-17:18 + break 12:00-12:36 → 08:00-12:00, 12:36-17:18.
 */
export function subtractBreaks(work: Segment[], breaks: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const w of work) {
    const s = toMin(w.start);
    let e = toMin(w.end);
    if (e <= s) e += 1440;
    let pieces: [number, number][] = [[s, e]];
    for (const b of breaks) {
      let bs = toMin(b.start);
      let be = toMin(b.end);
      if (be <= bs) be += 1440;
      if (bs < s) {
        bs += 1440;
        be += 1440;
      }
      pieces = pieces.flatMap(([a, z]) => {
        if (be <= a || bs >= z) return [[a, z] as [number, number]];
        const keep: [number, number][] = [];
        if (bs > a) keep.push([a, bs]);
        if (be < z) keep.push([be, z]);
        return keep;
      });
    }
    for (const [a, z] of pieces) if (z > a) out.push({ start: fmtHM(a % 1440), end: z % 1440 === 0 && z > 0 ? '24:00' : fmtHM(z % 1440) });
  }
  return out;
}

/** Reads the description that follows a code: times (minus breaks), kind and name. */
export function describeLegend(code: string, text: string): LegendDraft | null {
  // OCR spacing inside times: "05: 00", "08:00 -17:18".
  const rest = text.replace(/(\d{1,2})\s*([:.])\s+(\d{2})(?!\d)/g, '$1$2$3').replace(/\bpau\s+sa\b/gi, 'Pausa');
  const work: Segment[] = [];
  const breaks: Segment[] = [];
  const re = /(?<![\d:.])(\d{1,2}[:.h]\d{2})\s*(?:-|–|—|\/|à|a|bis|to)\s*(\d{1,2}[:.h]\d{2})(?![\d:.])/gi;
  for (const m of rest.matchAll(re)) {
    const seg = extractTimeRanges(m[0])[0];
    if (!seg) continue;
    if (BREAK_LABEL.test(rest.slice(Math.max(0, (m.index ?? 0) - 12), m.index))) breaks.push(seg);
    else work.push(seg);
  }
  let segments = work.length ? subtractBreaks(work, breaks) : extractTimeRanges(rest);
  if (!work.length && breaks.length) segments = [];
  const words = normalizeWords(rest.replace(/\d{1,2}([:.h]\d{2})?/g, ' '));
  let kind: DayKind = segments.length ? 'work' : 'other';
  if (!segments.length) {
    for (const [k, rx] of KIND_WORDS) {
      if (rx.test(words)) {
        kind = k;
        break;
      }
    }
  }
  const pause = breaks.length ? null : rest.match(/(?:pausa|break|pause)\D{0,6}(\d{1,3})\s*(?:min|')/i);
  const name = rest
    .replace(/\(.*?\)/g, ' ')
    .replace(/(\d{1,2}(?:[:.h]\d{2})?)\s*(?:-|–|—|\/|a|bis|to)\s*(\d{1,2}(?:[:.h]\d{2})?)/gi, ' ')
    .replace(LABELS, ' ')
    .replace(/\s[,/:;]\s|\s[,/:;]$|^[,/:;]\s*|\be\b|\bund\b|\bet\b|\band\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!segments.length && kind === 'other' && !name) return null;
  return { code, name: name || code, kind, segments, unpaidBreakMin: pause ? Number(pause[1]) : 0 };
}

/**
 * Parses a legend written as text, one code per line — no AI needed:
 * `P1 08:00-12:00 12:36-17:18`, `N = Notte 22-6 (pausa 30)`, `GR riposo`,
 * `P1 Piani 1  Orario di lavoro: 08:00-17:18 Pausa: 12:00-12:36`.
 */
export function parseLegendText(text: string): LegendDraft[] {
  const out: LegendDraft[] = [];
  for (const rawLine of text.split(/\r?\n|;/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z0-9ÀÜàü+\-_/]{1,10})\s*(?:[:=–—-]\s*)?(.*)$/);
    if (!m) continue;
    const code = m[1].toUpperCase().replace(/[-:]+$/, '');
    if (!/[A-Z]/.test(code) && !/^\d+$/.test(code)) continue;
    const d = describeLegend(code, m[2] ?? '');
    if (d) out.push(d);
  }
  return out;
}

/** Lines of a plan's tokens read along a tilt, with pieces OCR split rejoined ("08:00-1" / "5:12"). */
function linesAlong(tokens: Token[], tilt: number): string[] {
  const straight = tokens.map((t) => ({ ...t, y: t.y - tilt * (t.x + t.w / 2) }));
  const lines = groupLines(straight);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    let text = lines[i].text;
    let last = lines[i];
    while (i + 1 < lines.length) {
      const next = lines[i + 1];
      const lastTok = last.tokens[last.tokens.length - 1];
      const close = next.page === last.page && next.y - last.y < 0.9 * Math.max(next.h, last.h);
      if (!close || next.tokens[0].x < lastTok.x + lastTok.w * 0.5) break;
      text += ` ${next.text}`;
      last = next;
      i++;
    }
    out.push(text.replace(/(\d{1,2}[:.]\d{2}\s*-\s*\d)\s+(\d[:.]\d{2})/g, '$1$2'));
  }
  return out;
}

/** How convincing a legend entry is: times or a known kind, a real name, no other codes in it. */
function entryScore(d: LegendDraft, wanted: Set<string>): number {
  const others = d.name.split(/\s+/).filter((w) => wanted.has(normalizeCode(w)) && normalizeCode(w) !== d.code).length;
  // The same times over and over is a table row with times in its cells, not a legend.
  const repeated = new Set(d.segments.map((x) => `${x.start}-${x.end}`)).size < d.segments.length;
  return (d.segments.length ? 2 : 0) + (d.kind !== 'other' && d.kind !== 'work' ? 2 : 0) + (/[a-zà-ü]{3,}/.test(d.name) ? 1 : 0) - others - (repeated ? 3 : 0);
}

/**
 * Finds the legend entries of the given codes in a plan's lines ("GR: Libero",
 * "Housekeeping  R+P1  Ristorante + P1  Orario di lavoro: 05:00-08:00 Pausa: 07:30-08:00 …").
 */
export function extractLegend(lines: string[], codes: string[]): LegendDraft[] {
  const wanted = new Set(codes.map(normalizeCode).filter(Boolean));
  const found = new Map<string, { d: LegendDraft; score: number }>();
  for (const line of lines) {
    const words = line.split(/\s+/);
    // A row of the table itself ("P1 GR GR P1 …") is not a legend entry.
    if (words.filter((w) => wanted.has(normalizeCode(w))).length >= 3) continue;
    for (let i = 0; i < words.length && i < 4; i++) {
      const code = normalizeCode(words[i]);
      if (!wanted.has(code)) continue;
      // The code must be written as in the plan (not "ma" in a sentence).
      const bare = words[i].replace(/[:=.,]+$/, '');
      if (bare !== bare.toUpperCase()) break;
      const d = describeLegend(code, words.slice(i + 1).join(' '));
      if (d) {
        const score = entryScore(d, wanted);
        if (score > 0 && score > (found.get(code)?.score ?? 0)) found.set(code, { d, score });
      }
      break;
    }
  }
  return [...found.values()].map((f) => f.d);
}

/**
 * Reads the legend of a photographed or scanned plan for the given codes. Photos are often a
 * bit rotated or bent, so the text is re-read along several tilts and the most complete
 * reading wins.
 */
export function legendFromTokens(tokens: Token[], codes: string[]): LegendDraft[] {
  if (!codes.length || !tokens.length) return [];
  const wanted = new Set(codes.map(normalizeCode));
  let best: { list: LegendDraft[]; score: number; tilt: number } | null = null;
  for (let tilt = -0.08; tilt <= 0.0801; tilt += 0.005) {
    const list = extractLegend(linesAlong(tokens, tilt), codes);
    const score = list.reduce((sum, d) => sum + entryScore(d, wanted), 0);
    if (!best || score > best.score || (score === best.score && Math.abs(tilt) < Math.abs(best.tilt))) best = { list, score, tilt };
  }
  return best?.list ?? [];
}
