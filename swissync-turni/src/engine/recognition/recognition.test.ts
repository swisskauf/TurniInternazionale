import { describe, expect, it } from 'vitest';
import { legacyTypes } from '../presets';
import { detectPeriod } from './period';
import { extractKeywords, recognize, runScript } from './run';
import { newScript, SYSTEM_SCRIPTS } from './scripts';
import { linesToText, groupLines, tokensFromCells, tokensFromText, type PlanDocument, type Token } from './tokens';

const types = legacyTypes();
const grid = SYSTEM_SCRIPTS.find((s) => s.id === 'sys-grid')!;
const list = SYSTEM_SCRIPTS.find((s) => s.id === 'sys-list')!;

function doc(tokens: Token[], kind: PlanDocument['kind'] = 'image'): PlanDocument {
  return { kind, fileName: 'test', tokens, text: linesToText(groupLines(tokens)), images: [], pages: 1 };
}

/** Simulates OCR output of a photographed grid plan, with jitter and OCR misreads. */
function ocrGrid(): Token[] {
  const t: Token[] = [];
  const add = (text: string, x: number, y: number) => t.push({ text, x, y, w: text.length * 9, h: 14, page: 1 });
  add('PIANO', 20, 10); add('TURNI', 80, 11); add('Reparto', 150, 10); add('Gastronomia', 230, 12); add('NOVEMBRE', 400, 9); add('2026', 490, 10);
  const days = ['do', 'lu', 'ma', 'me', 'gi', 've', 'sa'];
  for (let d = 1; d <= 30; d++) {
    const x = 200 + (d - 1) * 40;
    add(days[d % 7 === 0 ? 0 : d % 7], x + 2, 40);
    if (d !== 17) add(String(d).padStart(2, '0'), x + (d % 3), 60 + (d % 2)); // OCR missed day 17
  }
  const rossi = ['P1', 'P1', 'Pl', 'GR', 'R+P1', 'MP2', '', 'P2', 'P2', 'GR', 'GR', 'P3', 'AN', 'P1'];
  add('Rossi', 20, 90); add('Mario', 75, 91);
  rossi.forEach((c, i) => c && add(c, 200 + i * 40 + 3, 90 + (i % 2)));
  add('Bianchi', 20, 120); add('Luca', 85, 121);
  ['GR', 'P2', 'P2'].forEach((c, i) => add(c, 200 + i * 40, 120));
  return t;
}

describe('period detection', () => {
  it('finds a month heading in several languages', () => {
    expect(detectPeriod('PIANO TURNI NOVEMBRE 2026')).toMatchObject({ year: 2026, month: 11 });
    expect(detectPeriod('Dienstplan März 2027')).toMatchObject({ year: 2027, month: 3 });
    expect(detectPeriod('Planning décembre 2026')).toMatchObject({ year: 2026, month: 12 });
    expect(detectPeriod('Periodo 04/2026')).toMatchObject({ year: 2026, month: 4 });
    expect(detectPeriod('dal 01.05.2026 al 31.05.2026')).toMatchObject({ year: 2026, month: 5 });
  });
});

describe('grid recognition (OCR-like tokens)', () => {
  it('reads one person row, fixing OCR misreads and missed headers', () => {
    const r = runScript(doc(ocrGrid()), grid, { person: 'Mario Rossi', types });
    expect(r.issues).not.toContain('no-header');
    expect(r.personLabel).toBe('Rossi Mario');
    expect(r.people).toEqual(['Rossi Mario', 'Bianchi Luca']);
    const byDate = Object.fromEntries(r.days.map((d) => [d.date, d]));
    expect(byDate['2026-11-01'].code).toBe('P1');
    expect(byDate['2026-11-03'].code).toBe('P1');
    expect(byDate['2026-11-03'].status).toBe('fuzzy');
    expect(byDate['2026-11-05'].code).toBe('R+P1');
    expect(byDate['2026-11-07']).toBeUndefined();
    expect(byDate['2026-11-14'].code).toBe('P1');
    expect(r.days.length).toBe(13);
    expect(r.quality).toBeGreaterThan(0.9);
  });
  it('uses initials to tell colleagues apart and asks when still ambiguous', () => {
    const toks = ocrGrid();
    const add = (text: string, x: number, y: number) => toks.push({ text, x, y, w: text.length * 9, h: 14, page: 1 });
    add('Rossi', 20, 150); add('L.', 75, 150);
    ['P3', 'P3'].forEach((c, i) => add(c, 200 + i * 40, 150));
    expect(runScript(doc(toks), grid, { person: 'Mario Rossi', types }).personLabel).toBe('Rossi Mario');
    const r = runScript(doc(toks), grid, { person: 'Rossi', types });
    expect(r.issues).toContain('choose-person');
    expect(r.people).toContain('Rossi L.');
  });
  it('asks to choose a person when the name is missing', () => {
    const r = runScript(doc(ocrGrid()), grid, { person: '', types });
    expect(r.issues).toContain('choose-person');
  });
  it('extracts fingerprint keywords from the title', () => {
    expect(extractKeywords(doc(ocrGrid()), 'Mario Rossi')).toEqual(['reparto', 'gastronomia']);
  });
});

describe('grid recognition (spreadsheet)', () => {
  it('reads a sheet with dates in the header and time ranges in cells', () => {
    const rows = [
      ['Turni dicembre', '', '', ''],
      ['Nome', '01.12.2026', '02.12.2026', '03.12.2026', '04.12.2026', '05.12.2026'],
      ['Anna Verdi', '08:00-12:00 13:00-17:00', 'P2', '', 'GV', 'mp1'],
    ];
    const r = runScript(doc(tokensFromCells(rows), 'sheet'), grid, { person: 'Anna Verdi', types });
    expect(r.days.map((d) => [d.date, d.code])).toEqual([
      ['2026-12-01', '08:00-12:00 13:00-17:00'],
      ['2026-12-02', 'P2'],
      ['2026-12-04', 'GV'],
      ['2026-12-05', 'MP1'],
    ]);
    expect(r.days[0].segments).toEqual([{ start: '08:00', end: '12:00' }, { start: '13:00', end: '17:00' }]);
  });
  it('reads a transposed sheet (days in rows, people in columns)', () => {
    const rows = [
      ['Piano gennaio 2027'],
      ['Data', 'Rossi', 'Verdi', 'Neri'],
      ['01.01.2027', 'GR', 'P1', 'P2'],
      ['02.01.2027', 'P1', 'P2', 'GR'],
      ['03.01.2027', 'P3', 'GR', 'P1'],
    ];
    const r = runScript(doc(tokensFromCells(rows), 'sheet'), grid, { person: 'Verdi', types });
    expect(r.layout).toBe('grid-rows');
    expect(r.days.map((d) => d.code)).toEqual(['P1', 'P2', 'GR']);
  });
});

describe('list recognition', () => {
  it('reads one line per day', () => {
    const text = `Ciao! Ecco i turni di novembre 2026:\nLun 02.11 P1\nMar 03.11: 08:00-12:00 / 13:00-17:00\nMer 04/11 riposo\n5.11 GR\n2026-11-06 MP2`;
    const r = runScript(doc(tokensFromText(text), 'text'), list, { person: '', types });
    expect(r.days.map((d) => [d.date, d.code, d.status])).toEqual([
      ['2026-11-02', 'P1', 'ok'],
      ['2026-11-03', '08:00-12:00 13:00-17:00', 'times'],
      ['2026-11-04', 'RIPOSO', 'unknown'],
      ['2026-11-05', 'GR', 'ok'],
      ['2026-11-06', 'MP2', 'ok'],
    ]);
  });
  it('supports custom line patterns', () => {
    const s = newScript({ id: 'x', name: 'x', layout: 'list', linePattern: '^(?<day>\\d{1,2})\\s+(?<month>[a-z]+)\\s+turno\\s+(?<code>\\S+)' });
    const r = runScript(doc(tokensFromText('3 novembre turno P2\n4 novembre turno GR'), 'text'), s, { person: '', types, period: { year: 2026, month: 11 } });
    expect(r.days.map((d) => [d.date, d.code])).toEqual([['2026-11-03', 'P2'], ['2026-11-04', 'GR']]);
  });
});

describe('ranking', () => {
  it('prefers a matching custom script over the generic ones', () => {
    const custom = newScript({ id: 'c', name: 'Gastronomia', createdBy: 'ai', keywords: ['gastronomia'], codeMap: [{ from: 'Pl', to: 'P1' }] });
    const ranked = recognize(doc(ocrGrid()), [...SYSTEM_SCRIPTS, custom], { person: 'Mario Rossi', types });
    expect(ranked[0].script.id).toBe('c');
    const d3 = ranked[0].result.days.find((d) => d.date === '2026-11-03')!;
    expect(d3.status).toBe('ok');
  });
});
