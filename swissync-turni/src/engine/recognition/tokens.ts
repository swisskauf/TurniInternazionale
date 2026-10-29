import type { SourceKind } from '../types';

/** A piece of text with its position on the page (any unit, consistent per page). */
export interface Token {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  page: number;
  /** OCR confidence 0..100 when available. */
  conf?: number;
}

/** A document reduced to positioned tokens — the common input of every recognition script. */
export interface PlanDocument {
  kind: SourceKind;
  fileName: string;
  tokens: Token[];
  /** Plain text in reading order (lines joined by \n). */
  text: string;
  /** Images (JPEG data URLs) suitable for sending to xAI when needed. */
  images: string[];
  pages: number;
  /** Year/month suggested by the source (e.g. Excel dates, file name). */
  hint?: { year?: number; month?: number };
}

export interface Line {
  tokens: Token[];
  y: number;
  h: number;
  page: number;
  text: string;
}

export const cx = (t: Token) => t.x + t.w / 2;
export const cy = (t: Token) => t.y + t.h / 2;

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Groups tokens into visual lines by vertical overlap, per page, in reading order. */
export function groupLines(tokens: Token[]): Line[] {
  const lines: Line[] = [];
  const pages = [...new Set(tokens.map((t) => t.page))].sort((a, b) => a - b);
  for (const page of pages) {
    const pageTokens = tokens.filter((t) => t.page === page && t.text.trim()).sort((a, b) => cy(a) - cy(b));
    const mh = median(pageTokens.map((t) => t.h)) || 10;
    const current: { tokens: Token[]; y: number }[] = [];
    for (const t of pageTokens) {
      const y = cy(t);
      let best: { tokens: Token[]; y: number } | undefined;
      let bestD = Infinity;
      for (const l of current) {
        const d = Math.abs(l.y - y);
        if (d < bestD) {
          bestD = d;
          best = l;
        }
      }
      if (best && bestD <= mh * 0.55) {
        best.tokens.push(t);
        best.y = best.tokens.reduce((s, k) => s + cy(k), 0) / best.tokens.length;
      } else {
        current.push({ tokens: [t], y });
      }
    }
    current.sort((a, b) => a.y - b.y);
    for (const l of current) {
      l.tokens.sort((a, b) => a.x - b.x);
      lines.push({
        tokens: l.tokens,
        y: l.y,
        h: median(l.tokens.map((t) => t.h)) || mh,
        page,
        text: l.tokens.map((t) => t.text).join(' '),
      });
    }
  }
  return lines;
}

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Lowercase, no accents, only letters/digits/spaces. */
export function normalizeWords(s: string): string {
  return stripAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Uppercase code form used for matching: no spaces, no accents, trailing dots removed. */
export function normalizeCode(s: string): string {
  return stripAccents(s).toUpperCase().replace(/\s+/g, '').replace(/[.,;:]+$/, '').trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Characters OCR commonly swaps; mapped to one representative so `PI`, `Pl` and `P1` compare equal. */
const CONFUSABLE: Record<string, string> = {
  O: '0', Q: '0', D: '0', '0': '0',
  I: '1', L: '1', '|': '1', '!': '1', '1': '1',
  S: '5', '5': '5', '$': '5',
  B: '8', '8': '8',
  Z: '2', '2': '2',
  G: '6', '6': '6',
};

export function confusableForm(code: string): string {
  return normalizeCode(code)
    .split('')
    .map((c) => CONFUSABLE[c] ?? c)
    .join('');
}

/** Builds tokens for a text that has no geometry (pasted text, CSV lines). */
export function tokensFromText(text: string): Token[] {
  const tokens: Token[] = [];
  text.split(/\r?\n/).forEach((line, row) => {
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      tokens.push({ text: m[0], x: m.index * 10, y: row * 30, w: m[0].length * 10, h: 20, page: 1 });
    }
  });
  return tokens;
}

/** Builds tokens for a spreadsheet: one token per non-empty cell. */
export function tokensFromCells(rows: string[][], page = 1): Token[] {
  const tokens: Token[] = [];
  rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      const text = (cell ?? '').toString().trim();
      if (!text) return;
      tokens.push({ text: text.replace(/\s*\n\s*/g, ' '), x: c * 100 + 5, y: r * 30 + 5, w: 90, h: 20, page });
    });
  });
  return tokens;
}

export function linesToText(lines: Line[]): string {
  return lines.map((l) => l.text).join('\n');
}
