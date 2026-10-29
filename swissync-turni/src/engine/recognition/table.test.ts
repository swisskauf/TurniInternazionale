import { describe, expect, it } from 'vitest';
import { addDays } from '../dates';
import type { ShiftType } from '../types';
import { createCellInterpreter } from './codes';
import { SYSTEM_SCRIPTS } from './scripts';
import { runScript } from './run';
import type { PlanDocument, Token } from './tokens';

/**
 * A synthetic "photo" of a colored shift table, built like the real ones it was tuned on:
 * dates truncated and glued by OCR, a camera not square to the sheet (tilt + shear), uneven
 * light, and cells whose text OCR could not read (only their color is left).
 */
const W = 1600;
const H = 900;
const START = '2026-10-05';
const DAYS = 21;
const COL0 = 300;
const COLW = 62;
const ROW0 = 300;
const ROWH = 40;
const TILT = 0.012;
const SHEAR = 0.05;

const PEOPLE = ['Rossi Anna', 'Bianchi Luca', 'Verdi Marco', 'Neri Sara'];
const PATTERNS = ['P1 GR P1 P1 GR', 'R+P1 R+P1 GR GR GR GR R+P1', 'GR P1 GR P1 P1 P1 GR GR', 'P1 P1 P1 GR GR R+P1'];
const grid = PATTERNS.map((p) => {
  const codes = p.split(' ');
  return Array.from({ length: DAYS }, (_, i) => codes[i % codes.length]);
});
const COLORS: Record<string, [number, number, number]> = {
  GR: [38, 118, 62],
  P1: [232, 222, 58],
  'R+P1': [222, 88, 112],
};

/** Sheet coordinates (flat) → photo coordinates. */
function photo(x: number, y: number): [number, number] {
  const xs = x + SHEAR * (y - 200);
  return [xs, y + TILT * xs];
}

function makeTokens(unreadable: (row: number, col: number) => boolean): Token[] {
  const tokens: Token[] = [];
  const add = (text: string, x: number, y: number, w: number, h = 14) => {
    const [px, py] = photo(x, y);
    tokens.push({ text, x: px, y: py, w, h, page: 1 });
  };
  add('Piano', 20, 40, 50);
  add('di', 75, 40, 16);
  add('servizio', 95, 40, 70);
  add('05.10.2026', 170, 40, 90);
  add('-', 265, 40, 8);
  add('25.10.2026', 280, 40, 90);
  add('Cognome', 30, 200, 70);
  // Header: OCR reads three truncated dates as one word ("05.10.2006.10.2007.10.20").
  for (let i = 0; i < DAYS; i += 3) {
    const text = [0, 1, 2]
      .filter((k) => i + k < DAYS)
      .map((k) => {
        const d = addDays(START, i + k);
        return `${d.slice(8, 10)}.${d.slice(5, 7)}.20`;
      })
      .join('');
    add(text, COL0 + i * COLW + 3, 200, COLW * Math.min(3, DAYS - i) - 6);
  }
  PEOPLE.forEach((name, r) => {
    const y = ROW0 + r * ROWH + 13;
    name.split(' ').forEach((part, k) => add(part, 30 + k * 70, y, part.length * 9));
    grid[r].forEach((code, c) => {
      if (unreadable(r, c)) return;
      // A typical OCR slip on dark cells: "GF" for "GR".
      const text = r === 1 && c === 9 ? 'GF' : c === 2 && code === 'GR' ? '|GR' : code;
      add(text, COL0 + c * COLW + 6, y, text.length * 9);
    });
  });
  // Legend under the table.
  add('GR:', 30, 560, 26);
  add('Libero', 60, 560, 50);
  return tokens;
}

function makeRaster(): { width: number; height: number; data: Uint8ClampedArray; scale: number } {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      // Invert the photo transform.
      const yFlat0 = py - TILT * px;
      const xFlat = px - SHEAR * (yFlat0 - 200);
      const yFlat = yFlat0;
      let rgb: [number, number, number] = [246, 244, 238];
      const col = Math.floor((xFlat - COL0) / COLW);
      const row = Math.floor((yFlat - ROW0) / ROWH);
      if (col >= 0 && col < DAYS && row >= 0 && row < PEOPLE.length) {
        const fx = (xFlat - COL0) / COLW - col;
        const fy = (yFlat - ROW0) / ROWH - row;
        rgb = fx < 0.03 || fy < 0.04 ? [60, 60, 60] : COLORS[grid[row][col]];
      }
      // Light falls off to the right of the photo.
      const light = 1 - 0.35 * (px / W);
      const i = (py * W + px) * 4;
      data[i] = rgb[0] * light;
      data[i + 1] = rgb[1] * light;
      data[i + 2] = rgb[2] * light;
      data[i + 3] = 255;
    }
  }
  return { width: W, height: H, data, scale: 1 };
}

const mk = (code: string, kind: ShiftType['kind'] = 'work'): ShiftType => ({
  id: code, code, name: code, kind, color: 'blue', segments: [], unpaidBreakMin: 0, creditedHours: 0, aliases: [], source: 'manual', createdAt: 0, updatedAt: 0,
});
const types = [mk('P1'), mk('R+P1'), mk('GR', 'rest'), mk('GF', 'holiday')];

function doc(tokens: Token[], withRaster: boolean): PlanDocument {
  return {
    kind: 'image',
    fileName: 'plan.jpg',
    tokens,
    text: 'Piano di servizio 05.10.2026 - 25.10.2026',
    images: [],
    pages: 1,
    raster: withRaster ? makeRaster() : undefined,
  };
}

describe('photographed table reader', () => {
  const raster = makeRaster();

  it('rebuilds a tilted grid with truncated, glued dates', () => {
    const res = runScript(doc(makeTokens(() => false), false), SYSTEM_SCRIPTS[0], { person: 'Bianchi Luca', types });
    expect(res.personLabel).toBe('Bianchi Luca');
    expect(res.people).toEqual(PEOPLE);
    expect(res.days).toHaveLength(DAYS);
    res.days.forEach((d, i) => {
      expect(d.date).toBe(addDays(START, i));
      // Without colors the "GF" misreading stays as read (it is a valid code).
      if (i !== 9) expect(d.code).toBe(grid[1][i]);
    });
  });

  it('reads unreadable cells by their color, even under uneven light', () => {
    // A third of the dark green cells have no OCR text at all.
    const tokens = makeTokens((r, c) => grid[r][c] === 'GR' && (r + c) % 3 === 0);
    const res = runScript({ ...doc(tokens, false), raster }, SYSTEM_SCRIPTS[0], { person: 'Bianchi Luca', types });
    expect(res.days.map((d) => d.code)).toEqual(grid[1]);
    expect(res.days.some((d) => d.byColor)).toBe(true);
    // The "GF" slip on a green cell is corrected by the sheet's colors.
    expect(res.days[9].code).toBe('GR');
  });

  it('finds every person row', () => {
    for (const [r, name] of PEOPLE.entries()) {
      const res = runScript({ ...doc(makeTokens(() => false), false), raster }, SYSTEM_SCRIPTS[0], { person: name, types });
      expect(res.days.map((d) => d.code)).toEqual(grid[r]);
    }
  });

  it('works out missing dates at the ends of the header from the cells', () => {
    const tokens = makeTokens(() => false).filter((t) => !/^(05\.10|23\.10)/.test(t.text));
    const res = runScript({ ...doc(tokens, false), text: 'Piano di servizio', raster }, SYSTEM_SCRIPTS[0], { person: 'Verdi Marco', types });
    expect(res.days[0].date).toBe(START);
    expect(res.days.map((d) => d.code)).toEqual(grid[2]);
  });

  it('interprets codes with marks and OCR border noise', () => {
    const interpret = createCellInterpreter({ types, codeMap: [], ignore: [], emptyMeans: 'skip' });
    expect(interpret('*R+P1').code).toBe('R+P1');
    expect(interpret('R+P1*').status).toBe('ok');
    expect(interpret('[GR').code).toBe('GR');
    expect(interpret('*R+P1 05:00 - 08:00 08:00 - 12:00').segments).toEqual([
      { start: '05:00', end: '08:00' },
      { start: '08:00', end: '12:00' },
    ]);
    // With the legend's hours, the shift's own break inside the written times is kept.
    const rp1 = { ...mk('R+P1'), segments: [{ start: '05:00', end: '07:30' }, { start: '08:00', end: '12:00' }, { start: '12:30', end: '15:12' }] };
    const p1 = { ...mk('P1'), segments: [{ start: '08:00', end: '12:00' }, { start: '12:36', end: '17:18' }] };
    const legendTypes = createCellInterpreter({ types: [rp1, p1], codeMap: [], ignore: [], emptyMeans: 'skip' });
    expect(legendTypes('*R+P1 05:00 - 08:00 08:00 - 12:00').segments).toEqual([
      { start: '05:00', end: '07:30' },
      { start: '08:00', end: '12:00' },
    ]);
    // A shorter day written by hand is taken as written…
    expect(legendTypes('P1 08:00-13:00').segments).toEqual([{ start: '08:00', end: '13:00' }]);
    // …but one line of a two-line cell (or swapped times) is not a whole shift: keep the
    // shift's hours and ask to check.
    for (const [text, typeId] of [['R+P1 05:00 - 08:00', 'R+P1'], ['P1 17:18 08:00', 'P1']]) {
      const r = legendTypes(text);
      expect(r).toMatchObject({ typeId, status: 'fuzzy' });
      expect(r.segments).toBeUndefined();
    }
    // The usual hours written out are just the shift itself.
    expect(legendTypes('P1 08:00-17:18')).toMatchObject({ typeId: 'P1', status: 'ok' });
    expect(legendTypes('P1 08:00-17:18').segments).toBeUndefined();
  });
});
