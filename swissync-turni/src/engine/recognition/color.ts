import { confusableForm, levenshtein } from './tokens';

/** Pixels of the photographed plan, used to read cell colors. */
export interface Raster {
  width: number;
  height: number;
  /** RGBA, row-major. */
  data: Uint8ClampedArray | Uint8Array;
  /** Raster pixels per token unit (tokens and raster may have different resolutions). */
  scale: number;
}

export type Lab = [number, number, number];

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function rgbToLab(r: number, g: number, b: number): Lab {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export const chroma = (c: Lab) => Math.hypot(c[1], c[2]);

/**
 * Color distance tuned for photos: lightness counts less than hue/chroma, since shadows and
 * uneven lighting change it across the sheet.
 */
export function colorDistance(a: Lab, b: Lab): number {
  return Math.hypot((a[0] - b[0]) * 0.35, a[1] - b[1], a[2] - b[2]);
}

/**
 * Background color of a cell: the median of its lighter pixels (the darker ones are the text
 * and the borders). Coordinates are in token units.
 */
export function cellColor(raster: Raster, x0: number, y0: number, x1: number, y1: number): Lab | null {
  const s = raster.scale;
  const ax = Math.max(0, Math.floor(Math.min(x0, x1) * s));
  const bx = Math.min(raster.width - 1, Math.ceil(Math.max(x0, x1) * s));
  const ay = Math.max(0, Math.floor(Math.min(y0, y1) * s));
  const by = Math.min(raster.height - 1, Math.ceil(Math.max(y0, y1) * s));
  if (bx - ax < 2 || by - ay < 2) return null;
  const step = Math.max(1, Math.floor(Math.sqrt(((bx - ax) * (by - ay)) / 500)));
  const px: { l: number; r: number; g: number; b: number }[] = [];
  for (let y = ay; y <= by; y += step) {
    for (let x = ax; x <= bx; x += step) {
      const i = (y * raster.width + x) * 4;
      const r = raster.data[i];
      const g = raster.data[i + 1];
      const b = raster.data[i + 2];
      px.push({ l: r * 0.299 + g * 0.587 + b * 0.114, r, g, b });
    }
  }
  if (px.length < 4) return null;
  px.sort((p, q) => p.l - q.l);
  const bg = px.slice(Math.floor(px.length * 0.4));
  const med = (k: 'r' | 'g' | 'b') => {
    const v = bg.map((p) => p[k]).sort((p, q) => p - q);
    return v[v.length >> 1];
  };
  return rgbToLab(med('r'), med('g'), med('b'));
}

export interface ColorPrototype {
  code: string;
  color: Lab;
  samples: number;
}

/** Below this chroma a cell is white/grey paper, when the sheet shows no empty cells to compare. */
const NEUTRAL = 9;
/** Max distance for a cell to be recognized by its color alone. */
const MATCH = 15;
/** Samples of empty cells (paper, weekend shading) are stored under this code. */
export const PAPER = '';

interface Sample {
  code: string;
  color: Lab;
  x: number;
  y: number;
}

const medianLab = (list: Lab[]): Lab => {
  const med = (k: 0 | 1 | 2) => {
    const v = list.map((c) => c[k]).sort((a, b) => a - b);
    return v[v.length >> 1];
  };
  return [med(0), med(1), med(2)];
};

/**
 * Learns "code → cell color" from the cells OCR could read on the same sheet, then recognizes
 * cells by color when their text is unreadable (e.g. dark text on dark green cells). Colors are
 * compared with the nearest readable cells of each code, so shadows and uneven light across
 * the photo don't matter.
 */
export class ColorModel {
  private samples: Sample[] = [];
  private protos: ColorPrototype[] | null = null;
  private byCode = new Map<string, Sample[]>();
  private paper: Sample[] = [];
  /** OCR misreadings folded into the dominant code of the same color (e.g. GF → GR). */
  readonly aliases = new Map<string, string>();

  /** Adds a readable cell (or an empty one, with `PAPER`) at position (x, y). */
  add(code: string, color: Lab | null, x = 0, y = 0) {
    if (!color) return;
    this.samples.push({ code, color, x, y });
    this.protos = null;
  }

  support(code: string): number {
    this.prototypes();
    return this.byCode.get(code)?.length ?? 0;
  }

  prototypes(): ColorPrototype[] {
    if (this.protos) return this.protos;
    const groups = new Map<string, Sample[]>();
    for (const s of this.samples) groups.set(s.code, [...(groups.get(s.code) ?? []), s]);
    this.paper = groups.get(PAPER) ?? [];
    groups.delete(PAPER);
    const paperColor = this.paper.length >= 3 ? medianLab(this.paper.map((s) => s.color)) : null;
    const raw: ColorPrototype[] = [];
    for (const [code, list] of groups) {
      const color = medianLab(list.map((s) => s.color));
      // A code printed on white cells carries no color information.
      if (paperColor ? colorDistance(color, paperColor) < MATCH * 0.6 : chroma(color) < NEUTRAL) continue;
      // Samples must agree: a code found on many different colors is not color-coded.
      const spread = list.filter((s) => colorDistance(s.color, color) < MATCH * 1.4).length / list.length;
      if (spread < 0.6) continue;
      raw.push({ code, color, samples: list.length });
    }
    raw.sort((a, b) => b.samples - a.samples);
    const kept: ColorPrototype[] = [];
    this.aliases.clear();
    this.byCode = new Map();
    for (const p of raw) {
      const twin = kept.find((k) => colorDistance(k.color, p.color) < MATCH * 0.8);
      if (twin && twin.samples > p.samples && looksAlike(twin.code, p.code)) {
        // A rarer "code" OCR could confuse with a common one of the same color: a misreading.
        this.aliases.set(p.code, twin.code);
        twin.samples += p.samples;
        this.byCode.get(twin.code)!.push(...groups.get(p.code)!);
        continue;
      }
      // Stray OCR noise on a common color.
      if (twin && twin.samples >= 3 * p.samples) continue;
      kept.push(p);
      this.byCode.set(p.code, [...groups.get(p.code)!]);
    }
    this.protos = kept;
    return kept;
  }

  private local(list: Sample[], x: number, y: number): Lab {
    const near = [...list].sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y)).slice(0, 5);
    return medianLab(near.map((s) => s.color));
  }

  /** Looks like an empty cell (paper or weekend shading) at (x, y). */
  isPaper(color: Lab | null, x = 0, y = 0): boolean {
    if (!color) return true;
    this.prototypes();
    if (this.paper.length < 3) return chroma(color) < NEUTRAL;
    return chroma(color) < 3 || colorDistance(color, this.local(this.paper, x, y)) < MATCH;
  }

  /**
   * The code whose color matches at (x, y), if the match is clear. Each code is represented by
   * its readable cells nearest to (x, y), so shadows across the photo don't matter.
   */
  classify(color: Lab | null, x = 0, y = 0): { code: string; distance: number } | null {
    if (!color) return null;
    const protos = this.prototypes();
    if (this.paper.length < 3 ? chroma(color) < NEUTRAL : chroma(color) < 3) return null;
    const cands = protos
      .map((p) => {
        const list = this.byCode.get(p.code)!;
        return { code: p.code, d: colorDistance(color, this.local(list, x, y)), n: list.length };
      })
      .sort((a, b) => a.d - b.d);
    const best = cands[0];
    if (!best || best.d > MATCH) return null;
    if (this.paper.length >= 3 && colorDistance(color, this.local(this.paper, x, y)) <= best.d) return null;
    const rival = cands.find((c) => c !== best && c.n * 4 >= best.n && c.d < best.d / 0.6);
    if (rival) return null;
    return { code: best.code, distance: best.d };
  }
}

export function isNeutral(color: Lab | null): boolean {
  return !!color && chroma(color) < NEUTRAL;
}

/** Two codes OCR could confuse with each other (GR/GF, P1/PI, R+P1/R+PI…). */
export function looksAlike(a: string, b: string): boolean {
  return confusableForm(a) === confusableForm(b) || levenshtein(a, b) <= 1;
}
