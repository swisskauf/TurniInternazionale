import { extractTimeRanges } from './time';
import { normalizeWords } from './recognition/tokens';
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

/**
 * Parses a legend written as text, one code per line — no AI needed:
 * `P1 08:00-12:00 12:36-17:18`, `N = Notte 22-6 (pausa 30)`, `GR riposo`.
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
    const rest = m[2] ?? '';
    const segments = extractTimeRanges(rest);
    const words = normalizeWords(rest.replace(/\d{1,2}([:.h]\d{2})?/g, ' '));
    let kind: DayKind = segments.length ? 'work' : 'other';
    if (!segments.length) {
      for (const [k, re] of KIND_WORDS) {
        if (re.test(words)) {
          kind = k;
          break;
        }
      }
    }
    const pause = rest.match(/(?:pausa|break|pause)\D{0,6}(\d{1,3})\s*(?:min|')/i);
    const name = rest
      .replace(/\(.*?\)/g, ' ')
      .replace(/(\d{1,2}(?:[:.h]\d{2})?)\s*(?:-|–|—|\/|a|bis|to)\s*(\d{1,2}(?:[:.h]\d{2})?)/gi, ' ')
      .replace(/[,+/]|\be\b|\bund\b|\bet\b|\band\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!segments.length && kind === 'other' && !name) continue;
    out.push({ code, name: name || code, kind, segments, unpaidBreakMin: pause ? Number(pause[1]) : 0 });
  }
  return out;
}
