import { addDays, diffDays, makeISO } from '../dates';
import type { ISODate } from '../types';
import type { CellResult } from './codes';
import { cellColor, ColorModel, looksAlike, PAPER, type Raster } from './color';
import { nameScore, WEEKDAY_ABBR } from './grid';
import type { DateRange } from './period';
import { cx, cy, groupLines, median, normalizeCode, type Token } from './tokens';

/**
 * Photographed tables: rebuilds the grid geometry (columns from the date header, rows from the
 * names) even when the photo is tilted or taken at an angle, assigns each cell's text to its
 * day and, when OCR can't read a cell, recognizes it by its color — learned on the same sheet
 * from the cells OCR could read.
 */

type Anchor = 'left' | 'center';

interface DateMark {
  day: number;
  month: number;
  year?: number;
  /** Where the date text starts / its center. */
  left: number;
  center: number;
  y: number;
  w: number;
  h: number;
  token: Token;
  idx: number;
}

const MARK_RE = /(\d{1,2})[.,/-](\d{1,2})(?=[.,/-]|$)/g;

/** Dates inside tokens, including headers OCR glued together ("05.10.20306.10.20307.10.20"). */
function dateMarks(tokens: Token[]): Omit<DateMark, 'idx'>[] {
  const out: Omit<DateMark, 'idx'>[] = [];
  for (const t of tokens) {
    const text = t.text;
    const matches = [...text.matchAll(MARK_RE)].filter((m) => {
      const d = Number(m[1]);
      const mo = Number(m[2]);
      return d >= 1 && d <= 31 && mo >= 1 && mo <= 12;
    });
    if (!matches.length) continue;
    const cw = t.w / Math.max(1, text.length);
    matches.forEach((m, k) => {
      const start = m.index ?? 0;
      const end = matches[k + 1]?.index ?? text.length;
      const digits = text.slice(start + m[0].length + 1).match(/^\d+/)?.[0] ?? '';
      let year: number | undefined;
      if (digits.length === 4) year = Number(digits);
      else if (digits.length === 2) year = 2000 + Number(digits);
      out.push({
        day: Number(m[1]),
        month: Number(m[2]),
        year,
        left: t.x + cw * start,
        center: t.x + cw * ((start + end) / 2),
        y: cy(t),
        w: cw * (end - start),
        h: t.h,
        token: t,
      });
    });
  }
  return out;
}

/** Calendar date of a header mark, resolving missing or truncated years around a reference date. */
function markDate(m: { day: number; month: number; year?: number }, ref: ISODate): ISODate | null {
  const refYear = Number(ref.slice(0, 4));
  if (m.year && Math.abs(m.year - refYear) <= 1) return makeISO(m.year, m.month, m.day);
  let best: ISODate | null = null;
  for (const y of [refYear - 1, refYear, refYear + 1]) {
    const iso = makeISO(y, m.month, m.day);
    if (iso && (!best || Math.abs(diffDays(ref, iso)) < Math.abs(diffDays(ref, best)))) best = iso;
  }
  return best;
}

interface Header {
  anchor: Anchor;
  origin: ISODate;
  lo: number;
  hi: number;
  a: number;
  b: number;
  c: number;
  /** Header line: y = y0 + r·x. */
  y0: number;
  r: number;
  h: number;
  marks: DateMark[];
  /** The title range, when the header confirmed it: the exact set of columns. */
  range?: DateRange;
}

const markX = (m: DateMark, anchor: Anchor) => (anchor === 'left' ? m.left : m.center);
const tokenX = (t: Token, anchor: Anchor) => (anchor === 'left' ? t.x : cx(t));

function leastSquares(xs: number[], ys: number[]): { p: number; q: number } {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  const q = sxx ? sxy / sxx : 0;
  return { p: my - q * mx, q };
}

/** Linear least squares (normal equations + Gaussian elimination). Null if degenerate. */
function solveLS(rows: number[][], ys: number[]): number[] | null {
  const k = rows[0]?.length ?? 0;
  if (!k || rows.length < k) return null;
  const M = Array.from({ length: k }, () => new Array<number>(k + 1).fill(0));
  rows.forEach((row, n) => {
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) M[i][j] += row[i] * row[j];
      M[i][k] += row[i] * ys[n];
    }
  });
  for (let col = 0; col < k; col++) {
    let piv = col;
    for (let r = col + 1; r < k; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-7 * (1 + Math.abs(M[col][col]))) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < k; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= k; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[k] / row[i]);
}

/** Finds the date header: the largest set of marks lined up with a constant day spacing. */
function fitHeader(marksIn: Omit<DateMark, 'idx'>[], anchor: Anchor, ref: ISODate, ranges: DateRange[]): Header | null {
  const origin = ref;
  const marks: DateMark[] = [];
  for (const m of marksIn) {
    const iso = markDate(m, ref);
    if (iso) marks.push({ ...m, idx: diffDays(origin, iso) });
  }
  if (marks.length < 3) return null;
  let best: { inliers: DateMark[]; err: number } | null = null;
  for (const A of marks) {
    for (const B of marks) {
      if (B.idx <= A.idx || B.idx - A.idx > 62) continue;
      const ax = markX(A, anchor);
      const bx = markX(B, anchor);
      const b = (bx - ax) / (B.idx - A.idx);
      // Spacing must fit the date text (rules out a "05.10.2026 - 25.10.2026" title).
      if (b <= 0 || b < 0.5 * Math.min(A.w, B.w)) continue;
      const r = (B.y - A.y) / (bx - ax);
      if (Math.abs(r) > 0.3) continue;
      const byIdx = new Map<number, DateMark>();
      let err = 0;
      for (const m of marks) {
        const dx = Math.abs(markX(m, anchor) - (ax + b * (m.idx - A.idx)));
        const dy = Math.abs(m.y - (A.y + r * (markX(m, anchor) - ax)));
        if (dx < 0.35 * b && dy < Math.max(m.h, A.h)) {
          if (!byIdx.has(m.idx)) byIdx.set(m.idx, m);
          err += dx / b;
        }
      }
      if (byIdx.size < 3) continue;
      if (!best || byIdx.size > best.inliers.length || (byIdx.size === best.inliers.length && err < best.err)) {
        best = { inliers: [...byIdx.values()], err };
      }
    }
  }
  if (!best) return null;
  const inl = best.inliers;
  const idxs = inl.map((m) => m.idx);
  const lin = leastSquares(idxs, inl.map((m) => markX(m, anchor)));
  let lo = Math.min(...idxs);
  let hi = Math.max(...idxs);
  // Trust a title range ("05.10.2026 - 25.10.2026") only if the header agrees with it: a photo
  // can also catch the title of another sheet.
  const range = ranges.find((rg) => {
    const s0 = diffDays(origin, rg.start);
    const s1 = diffDays(origin, rg.end);
    return inl.filter((m) => m.idx >= s0 && m.idx <= s1).length >= inl.length * 0.8;
  });
  if (range) {
    lo = diffDays(origin, range.start);
    hi = diffDays(origin, range.end);
  }
  const yl = leastSquares(inl.map((m) => markX(m, anchor)), inl.map((m) => m.y));
  // Index columns from the first one (keeps the perspective fit well conditioned).
  const shift = lo;
  for (const m of inl) m.idx -= shift;
  return {
    anchor,
    origin: addDays(origin, shift),
    lo: 0,
    hi: hi - shift,
    a: lin.p + lin.q * shift,
    b: lin.q,
    c: 0,
    y0: yl.p,
    r: yl.q,
    h: median(inl.map((m) => m.h)) || 12,
    marks: inl,
    range,
  };
}

const CODE_RE = /^\*?[A-Z0-9][A-Z0-9+*/-]{0,5}$/;
/** Times written inside cells ("05:00 -", "08:00-12:00"): part of the table, not codes. */
const TIME_RE = /^\d{1,2}[:.]\d{2}(?:-\d{1,2}[:.]\d{2})?-?$/;
const isCellText = (t: Token) => CODE_RE.test(normalizeCode(t.text)) || TIME_RE.test(normalizeCode(t.text));
const WEEKDAY_RE = new RegExp(`^(?:${WEEKDAY_ABBR})\\.?$`, 'i');

/**
 * Where column i is at a height dy below the header:
 *   x = a + b·i + c·i² + (s0 + s1·i)·dy   (+ o for the cells' text)
 * c models perspective along the header, s0 a camera not square to the sheet, s1 keystone.
 */
interface Geometry {
  head: Header;
  a: number;
  b: number;
  c: number;
  s0: number;
  s1: number;
  /** Offset of the cells' text from the header text, in token units. */
  o: number;
  body: Token[];
  top: number;
  bottom: number;
  /** Day columns found (header dates plus columns that hold cells). */
  lo: number;
  hi: number;
  /** Residual of the fit, in columns (lower is better). */
  rms: number;
}

const headerY = (h: Header, x: number) => h.y0 + h.r * x;
const dyOf = (h: Header, t: Token) => cy(t) - headerY(h, cx(t));
const colX = (g: Geometry, i: number, dy: number) => g.a + g.b * i + g.c * i * i + (g.s0 + g.s1 * i) * dy;

/** Fractional column of an x at height dy. */
function colIndex(g: Geometry, x: number, dy: number, body: boolean): number {
  const A = g.c;
  const B = g.b + g.s1 * dy;
  const C = g.a + g.s0 * dy + (body ? g.o : 0) - x;
  if (Math.abs(A) < 1e-9) return -C / B;
  const disc = B * B - 4 * A * C;
  return disc < 0 ? -C / B : (-B + Math.sqrt(disc)) / (2 * A);
}

function tokenColumn(g: Geometry, t: Token): number {
  return Math.round(colIndex(g, tokenX(t, g.head.anchor), dyOf(g.head, t), true));
}

/** Center of the cell of column i at height dy. */
function cellCenterX(g: Geometry, i: number, dy: number): number {
  const x = colX(g, i, dy);
  if (g.head.anchor === 'center') return x;
  // Left-aligned text starts just after the cell border.
  return (x + colX(g, i + 1, dy)) / 2 - 0.06 * g.b;
}

/** Short code-like tokens below the header, inside the table (not the legend under it). */
function bodyTokens(tokens: Token[], head: Header): Token[] {
  const markTokens = new Set(head.marks.map((m) => m.token));
  const { b, h } = head;
  // Without a confirmed range, OCR may have missed dates at both ends of the header.
  const xMin = head.a + b * head.lo - (head.range ? 0.8 : 3) * b;
  const xMax = head.a + b * head.hi + (head.range ? 1.2 : 8) * b;
  let cand = tokens.filter((t) => {
    if (markTokens.has(t)) return false;
    // Words ("Kati", "lun") are names and headings, not cells.
    if ((t.text.match(/[a-zà-ü]/g)?.length ?? 0) >= 2) return false;
    const dy = dyOf(head, t);
    if (dy < 0.6 * h) return false;
    const slack = 0.3 * dy;
    return cx(t) > xMin - slack && cx(t) < xMax + slack && isCellText(t);
  });
  // Weekday row right under the dates ("lun mar mer"): not cells.
  const wk = cand.filter((t) => WEEKDAY_RE.test(t.text.trim()) && dyOf(head, t) < 4 * h);
  if (wk.length >= 3) {
    const wy = median(wk.map((t) => dyOf(head, t)));
    cand = cand.filter((t) => Math.abs(dyOf(head, t) - wy) > 0.8 * h);
  }
  // Lines of cells; isolated specks don't count. The table ends at the first big gap.
  cand.sort((p, q) => dyOf(head, p) - dyOf(head, q));
  const clusters: Token[][] = [];
  for (const t of cand) {
    const last = clusters[clusters.length - 1];
    if (last && dyOf(head, t) - dyOf(head, last[last.length - 1]) < 0.8 * h) last.push(t);
    else clusters.push([t]);
  }
  const lines = clusters.filter((c) => c.length >= 2);
  const body: Token[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i > 0 && dyOf(head, lines[i][0]) - dyOf(head, lines[i - 1][lines[i - 1].length - 1]) > 6 * h) break;
    body.push(...lines[i]);
  }
  return body;
}

function fitGeometry(head: Header, body: Token[]): Geometry | null {
  if (body.length < 3) return null;
  const { anchor, b } = head;
  const g: Geometry = { head, a: head.a, b, c: 0, s0: 0, s1: 0, o: 0, body, top: 0, bottom: 0, lo: head.lo, hi: head.hi, rms: 1 };
  // Initial shear: the value that best lines the cells' text up in columns.
  let bestR = -1;
  for (let s = -0.3; s <= 0.3001; s += 0.005) {
    let sc = 0;
    let ss = 0;
    for (const t of body) {
      const u = (tokenX(t, anchor) - s * dyOf(head, t) - head.a) / b;
      sc += Math.cos(2 * Math.PI * u);
      ss += Math.sin(2 * Math.PI * u);
    }
    const R = Math.hypot(sc, ss) / body.length;
    if (R > bestR + 1e-6) {
      bestR = R;
      g.s0 = s;
      g.o = (Math.atan2(ss, sc) / (2 * Math.PI)) * b;
    }
  }
  // Refine everything jointly on the header dates and the cells, re-assigning columns each time
  // and growing over columns whose dates OCR missed.
  let stable = 0;
  for (let it = 0; it < 40 && stable < 3; it++) {
    const spanIdx = g.hi - g.lo;
    const rows: number[][] = [];
    const ys: number[] = [];
    const quad = spanIdx >= 6;
    const feat = (i: number, dy: number, isBody: number) => (quad ? [1, i, i * i, dy, i * dy, isBody] : [1, i, dy, i * dy, isBody]);
    for (const m of head.marks) {
      rows.push(feat(m.idx, 0, 0));
      ys.push(markX(m, anchor));
    }
    for (const t of body) {
      const dy = dyOf(head, t);
      const u = colIndex(g, tokenX(t, anchor), dy, true);
      const i = Math.round(u);
      if (Math.abs(u - i) > 0.38 || i < g.lo - 1 || i > g.hi + 1) continue;
      rows.push(feat(i, dy, 1));
      ys.push(tokenX(t, anchor));
    }
    const sol = solveLS(rows, ys);
    if (!sol) break;
    const [a, bb, c, s0, s1, o] = quad ? sol : [sol[0], sol[1], 0, sol[2], sol[3], sol[4]];
    // Perspective bends the grid a little, never a lot; the cell text sits inside its column.
    if (bb <= 0 || Math.abs(c) * spanIdx > 0.25 * bb || Math.abs(s1) > 0.02) break;
    Object.assign(g, { a, b: bb, c, s0, s1, o });
    if (g.o > 0.5 * g.b) g.o -= g.b;
    if (g.o < -0.5 * g.b) g.o += g.b;
    stable++;
    if (head.range || g.hi - g.lo >= 62) continue;
    const aligned = (k: number) =>
      body.filter((t) => {
        const u = colIndex(g, tokenX(t, anchor), dyOf(head, t), true);
        return Math.round(u) === k && Math.abs(u - k) < 0.3;
      }).length;
    if (aligned(g.hi + 1) >= 3) {
      g.hi++;
      stable = 0;
    } else if (aligned(g.lo - 1) >= 3) {
      g.lo--;
      stable = 0;
    }
  }
  let sq = 0;
  let n = 0;
  for (const t of body) {
    const u = colIndex(g, tokenX(t, anchor), dyOf(head, t), true);
    const d = Math.min(0.5, Math.abs(u - Math.round(u)));
    sq += d * d;
    n++;
  }
  g.rms = Math.sqrt(sq / n);
  g.top = Math.min(...body.map(cy));
  g.bottom = Math.max(...body.map(cy));
  return g;
}

function buildGeometry(tokens: Token[], ref: ISODate, ranges: DateRange[]): Geometry | null {
  const marks = dateMarks(tokens);
  let best: Geometry | null = null;
  for (const anchor of ['left', 'center'] as Anchor[]) {
    const head = fitHeader(marks, anchor, ref, ranges);
    if (!head) continue;
    const g = fitGeometry(head, bodyTokens(tokens, head));
    if (g && (!best || g.rms < best.rms - 0.01 || (Math.abs(g.rms - best.rms) <= 0.01 && g.head.marks.length > best.head.marks.length))) best = g;
  }
  return best;
}

export interface TableRow {
  label: string;
  x: number;
  y: number;
}

/** Names left of the first day column, one per table row. */
function tableRows(tokens: Token[], g: Geometry): { rows: TableRow[]; labelTokens: Set<Token> } {
  const { head } = g;
  // Codes that fill the table: a "GR" left of where the grid seems to start is a cell, not a name.
  const freq = new Map<string, number>();
  for (const t of g.body) freq.set(normalizeCode(t.text), (freq.get(normalizeCode(t.text)) ?? 0) + 1);
  const common = [...freq].filter(([, n]) => n >= 3).map(([c]) => c);
  const isCell = (t: Token) => {
    const code = normalizeCode(t.text);
    return t.text === t.text.toUpperCase() && common.some((c) => c === code || (code.length <= 4 && looksAlike(c, code)));
  };
  const labelTokens = tokens.filter((t) => {
    if (isCell(t)) return false;
    const y = cy(t);
    const dy = dyOf(head, t);
    if (dy < 0.6 * head.h || y > g.bottom + 2 * head.h) return false;
    const firstCell = cellCenterX(g, g.lo, dy) - 0.5 * g.b;
    return t.x + t.w < firstCell + 0.15 * g.b && /[a-zà-ü]{2,}/i.test(t.text);
  });
  const rows = groupLines(labelTokens)
    .map((l) => ({ label: l.text.replace(/^[|\\[\]{}()]+\s*/, '').trim(), x: l.tokens[0].x, y: l.y }))
    .filter((r) => /[a-zà-ü]{3,}/i.test(r.label));
  return { rows, labelTokens: new Set(labelTokens) };
}

export interface TableCell extends CellResult {
  date: ISODate;
  byColor?: boolean;
}

export interface TableResult {
  people: string[];
  personLabel?: string;
  ambiguous: boolean;
  cells: TableCell[];
  noPerson: boolean;
}

export interface TableInput {
  tokens: Token[];
  raster?: Raster;
  ref: ISODate;
  /** Date ranges found in the title, best first. */
  ranges: DateRange[];
  person: string;
  aliases: string[];
  interpret: (text: string) => CellResult;
  /** Diagnostics hook (tests and tools). */
  debug?: (what: string, data: unknown) => void;
}

function cellText(tokens: Token[]): string {
  const h = median(tokens.map((t) => t.h)) || 10;
  return [...tokens]
    .sort((p, q) => Math.round(cy(p) / (0.8 * h)) - Math.round(cy(q) / (0.8 * h)) || p.x - q.x)
    .map((t) => t.text)
    .join(' ');
}

/** Runs the table reader. Returns null when the document has no recognizable date header. */
export function readTable(input: TableInput): TableResult | null {
  const tokens = input.tokens.filter((t) => t.text.trim());
  const g = buildGeometry(tokens, input.ref, input.ranges);
  if (!g) return null;
  const cols = g.head;
  const { rows, labelTokens } = tableRows(tokens, g);
  g.body = g.body.filter((t) => !labelTokens.has(t));
  input.debug?.('geometry', {
    anchor: cols.anchor, origin: cols.origin, lo: g.lo, hi: g.hi, range: cols.range, a: g.a, b: g.b, c: g.c, s0: g.s0, s1: g.s1, o: g.o, rms: g.rms, r: cols.r,
    marks: cols.marks.map((m) => `${m.day}.${m.month}#${m.idx}@${Math.round(markX(m, cols.anchor))},${Math.round(m.y)}`),
    top: g.top, bottom: g.bottom, rows: rows.map((r) => `${r.label}@${Math.round(r.x)},${Math.round(r.y)}`),
  });
  const res: TableResult = { people: rows.map((r) => r.label), ambiguous: false, cells: [], noPerson: false };

  let target: TableRow | undefined;
  let targetIdx = -1;
  if (input.person) {
    let bestScore = 0;
    const scores = rows.map((r) => nameScore(r.label, input.person, input.aliases));
    scores.forEach((s, i) => {
      if (s >= 0.5 && s > bestScore) {
        bestScore = s;
        target = rows[i];
        targetIdx = i;
      }
    });
    if (target && bestScore < 1.04 && scores.filter((s) => s === bestScore).length > 1) {
      res.ambiguous = true;
      target = undefined;
    }
  } else if (rows.length === 1) {
    target = rows[0];
    targetIdx = 0;
  }
  if (!target) {
    res.noPerson = !!input.person && !res.ambiguous;
    return res;
  }
  res.personLabel = target.label;

  const { b } = g;
  const gaps = rows.slice(1).map((r, i) => r.y - rows[i].y).filter((d) => d > 1.2 * cols.h);
  const rowH = median(gaps) || 2.4 * cols.h;
  const th = median(g.body.map((t) => t.h)) || cols.h;

  // Text of one cell can span several lines (codes with times): stack it per column first.
  interface Stack { col: number; tokens: Token[]; x: number; y: number }
  const perCol = new Map<number, Token[]>();
  for (const t of g.body) {
    const i = tokenColumn(g, t);
    perCol.set(i, [...(perCol.get(i) ?? []), t]);
  }
  const stacks: Stack[] = [];
  for (const [col, list] of perCol) {
    list.sort((p, q) => cy(p) - cy(q));
    let cur: Token[] = [];
    const flush = () => {
      if (!cur.length) return;
      const top = Math.min(...cur.map((t) => t.y));
      const bottom = Math.max(...cur.map((t) => t.y + t.h));
      stacks.push({ col, tokens: cur, x: median(cur.map(cx)), y: (top + bottom) / 2 });
      cur = [];
    };
    for (const t of list) {
      if (cur.length && cy(t) - cy(cur[cur.length - 1]) > 1.7 * th) flush();
      cur.push(t);
    }
    flush();
  }

  // Each stack belongs to the row whose line passes closest; lines are refined on their stacks.
  // y = p + q·x + w·(x − xm)²: a sheet that isn't flat bends its rows.
  const lines = rows.map((r) => ({ p: r.y - cols.r * r.x, q: cols.r, w: 0, xm: 0 }));
  const lineY = (l: (typeof lines)[number], x: number) => l.p + l.q * x + l.w * (x - l.xm) ** 2;
  let owner: number[] = [];
  for (let it = 0; it < 3; it++) {
    owner = stacks.map((st) => {
      let best = -1;
      let bd = 1.5 * rowH;
      lines.forEach((l, k) => {
        const d = Math.abs(st.y - lineY(l, st.x));
        if (d < bd) {
          bd = d;
          best = k;
        }
      });
      return best;
    });
    lines.forEach((l, k) => {
      const mine = stacks.filter((_, n) => owner[n] === k);
      if (mine.length < 3 || Math.max(...mine.map((m) => m.col)) - Math.min(...mine.map((m) => m.col)) < 3) return;
      const span = Math.max(...mine.map((m) => m.col)) - Math.min(...mine.map((m) => m.col));
      const xm = mine.reduce((sum, m) => sum + m.x, 0) / mine.length;
      const fit = leastSquares(mine.map((m) => m.x), mine.map((m) => m.y));
      if (Math.abs(fit.q - cols.r) >= 0.05) return;
      Object.assign(l, { ...fit, w: 0, xm: 0 });
      if (mine.length < 8 || span < 8) return;
      // Bend only when the row clearly is bent (the curve must explain much more than a line).
      const sol = solveLS(mine.map((m) => [1, m.x, (m.x - xm) ** 2]), mine.map((m) => m.y));
      if (!sol) return;
      const half = (Math.max(...mine.map((m) => m.x)) - Math.min(...mine.map((m) => m.x))) / 2;
      const rss = (f: (x: number) => number) => mine.reduce((sum, m) => sum + (m.y - f(m.x)) ** 2, 0);
      const linear = rss((x) => fit.p + fit.q * x);
      const curved = rss((x) => sol[0] + sol[1] * x + sol[2] * (x - xm) ** 2);
      if (curved < 0.5 * linear && Math.abs(sol[2]) * half * half < 0.35 * rowH) Object.assign(l, { p: sol[0], q: sol[1], w: sol[2], xm });
    });
  }

  // A header that lost its first/last dates to OCR: extend over columns that hold cells.
  let { lo, hi } = g;
  if (!cols.range) {
    const busyRows = new Set(owner.filter((o) => o >= 0)).size;
    const filled = (i: number) => stacks.filter((st, n) => st.col === i && owner[n] >= 0).length >= Math.max(3, 0.25 * busyRows);
    while (hi - lo < 62 && filled(hi + 1)) hi++;
    while (hi - lo < 62 && filled(lo - 1)) lo--;
  }

  const rowY = (x: number) => lineY(lines[targetIdx], x);
  const sampleAt = (i: number, y: number) => {
    if (!input.raster) return null;
    let x = cellCenterX(g, i, y - headerY(cols, colX(g, i, 0)));
    x = cellCenterX(g, i, y - headerY(cols, x));
    return cellColor(input.raster, x - 0.3 * b, y - 0.22 * rowH, x + 0.3 * b, y + 0.22 * rowH);
  };

  // Learn each code's cell color from every readable cell of the sheet.
  const model = new ColorModel();
  if (input.raster) {
    for (const st of stacks) {
      const codes = st.tokens.filter((t) => CODE_RE.test(normalizeCode(t.text)));
      // One code per cell; split cells ("MP2 | GR") have two colors.
      if (codes.length !== 1) continue;
      const t = codes[0];
      if (g.body.some((o) => o !== t && Math.abs(cy(o) - cy(t)) < 0.5 * t.h && Math.abs(cx(o) - cx(t)) < 0.6 * b)) continue;
      const r = input.interpret(t.text);
      const code = r.status === 'ok' || r.status === 'fuzzy' ? r.code : r.status === 'unknown' ? normalizeCode(t.text) : '';
      if (code) model.add(code, sampleAt(st.col, st.y), st.x, st.y);
    }
    // Rows without any text (blank separators, unassigned people): what an empty cell looks like.
    lines.forEach((l, k) => {
      if (owner.includes(k)) return;
      for (let i = lo; i <= hi; i++) {
        const x = cellCenterX(g, i, lineY(l, colX(g, i, 0)) - headerY(cols, colX(g, i, 0)));
        model.add(PAPER, sampleAt(i, lineY(l, x)), x, lineY(l, x));
      }
    });
  }
  input.debug?.('rows', {
    rowH, lo, hi,
    line: lines[targetIdx],
    protos: model.prototypes().map((k) => `${k.code}:${k.samples}:${k.color.map(Math.round).join('/')}`),
    aliases: [...model.aliases],
    target: stacks.filter((_, n) => owner[n] === targetIdx).map((st) => `${st.col}:${st.tokens.map((t) => t.text).join(' ')}`),
  });

  const byCol = new Map<number, Token[]>();
  stacks.forEach((st, n) => {
    if (owner[n] === targetIdx) byCol.set(st.col, [...(byCol.get(st.col) ?? []), ...st.tokens]);
  });

  for (let i = lo; i <= hi; i++) {
    const date = addDays(cols.origin, i);
    let r = input.interpret(cellText(byCol.get(i) ?? []));
    let byColor = false;
    const cxI = cellCenterX(g, i, rowY(colX(g, i, 0)) - headerY(cols, colX(g, i, 0)));
    const color = sampleAt(i, rowY(cxI));
    const hit = model.classify(color, cxI, rowY(cxI));
    if (hit) {
      const read = r.status === 'unknown' ? normalizeCode(r.code) : r.code;
      const alias = model.aliases.get(read);
      if (r.status === 'empty' || (r.status === 'unknown' && !alias)) {
        r = { ...input.interpret(hit.code), raw: r.raw };
        if (r.status === 'ok') r = { ...r, status: 'fuzzy', confidence: 0.75 };
        byColor = true;
      } else if (alias === hit.code || (hit.code !== read && model.support(read) < 2 && model.support(hit.code) >= 5 && looksAlike(read, hit.code))) {
        // OCR misread (GF for GR): the color and the rest of the sheet say otherwise.
        r = { ...input.interpret(hit.code), segments: r.segments, raw: r.raw };
        if (r.status === 'ok') r = { ...r, status: 'fuzzy', confidence: 0.8 };
        byColor = true;
      }
    } else if (r.status === 'empty' && color && !model.isPaper(color, cxI, rowY(cxI)) && model.prototypes().length >= 2) {
      // A colored cell nobody could read: flag it instead of silently skipping the day.
      r = { raw: '', code: '?', status: 'unknown', confidence: 0.1 };
    }
    if (r.status === 'empty' && !r.kind) continue;
    res.cells.push({ ...r, date, byColor: byColor || undefined });
  }
  return res;
}
