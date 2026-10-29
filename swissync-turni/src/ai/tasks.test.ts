import { describe, expect, it } from 'vitest';
import { compareDays, legendToTypes, payslipToProfile, scriptFromAi, type PayslipOutput } from './tasks';
import { readText } from '@/import/readers';

describe('AI result mapping', () => {
  it('turns a Swiss payslip into a pay profile', () => {
    const slip: PayslipOutput = {
      employer: 'Gastronomia Lugano SA', employeeName: 'Mario Rossi', period: { year: 2026, month: 10 }, currency: 'chf',
      payType: 'hourly', hourlyRate: 19.75, monthlySalary: 0, hoursPaid: 160,
      earnings: [
        { label: 'Salario orario', category: 'base', hours: 160, rate: 19.75, pct: 0, amount: 3160, social: true },
        { label: 'Indennità ferie', category: 'vacation', hours: 0, rate: 0, pct: 10.64, amount: 336.25, social: true },
        { label: '13a', category: 'thirteenth', hours: 0, rate: 0, pct: 0, amount: 263.25, social: true },
        { label: 'Suppl. domenicale', category: 'sunday', hours: 16, rate: 19.75, pct: 0, amount: 79, social: true },
        { label: 'Vestiario', category: 'extra', hours: 154.5, rate: 0.25, pct: 0, amount: 38.6, social: false },
      ],
      deductions: [
        { label: 'AVS/AI/IPG', category: 'avs', pct: 5.3, base: 'social', baseFactor: 1, amount: 203.4 },
        { label: 'LPP', category: 'lpp', pct: 1, base: 'base', baseFactor: 0.5, amount: 15.8 },
        { label: 'Imposta fonte', category: 'tax', pct: 0, base: 'gross', baseFactor: 1, amount: 115 },
      ],
      gross: 3877.1, net: 3542.9, notes: '',
    };
    const p = payslipToProfile(slip);
    expect(p).toMatchObject({ configured: true, source: 'payslip', currency: 'CHF', rounding: 0.05, mode: 'hourly', hourlyRate: 19.75 });
    expect(p.allowances.vacationPct).toBe(10.64);
    expect(p.allowances.thirteenthPct).toBeCloseTo(8.33, 1);
    expect(p.supplements.sundayPct).toBe(25);
    expect(p.extras[0]).toMatchObject({ type: 'per-hour', amount: 0.25, social: false });
    expect(p.deductions.map((d) => [d.label, d.pct, d.base, d.baseFactor])).toEqual([
      ['AVS/AI/IPG', 5.3, 'social', 1],
      ['LPP', 1, 'base', 0.5],
      ['Imposta fonte', expect.closeTo(2.98, 1), 'gross', 1],
    ]);
  });

  it('builds a reusable script and measures how well it reproduces the AI result', () => {
    const doc = readText('Turni novembre 2026\n02.11 P1\n03.11 PI\n04.11 GR');
    const script = scriptFromAi({ layout: 'list', header: 'auto', keywords: ['Turni', 'x'], personLabel: '', codeMap: [{ from: 'PI', to: 'P1' }, { from: 'GR', to: 'GR' }], ignore: [], emptyMeans: 'skip', linePattern: '', dateOrder: 'DMY' }, doc, 'Mario');
    expect(script.keywords).toEqual(['Turni']);
    expect(script.codeMap).toEqual([{ from: 'PI', to: 'P1' }]);
    expect(script.createdBy).toBe('ai');
    const expected = [{ date: '2026-11-02', code: 'P1' }, { date: '2026-11-03', code: 'P1' }, { date: '2026-11-04', code: 'GR' }];
    const local = [
      { date: '2026-11-02', code: 'P1', raw: 'P1', status: 'unknown' as const, confidence: 0.2 },
      { date: '2026-11-03', code: 'P1', raw: 'PI', status: 'unknown' as const, confidence: 0.2 },
    ];
    expect(compareDays(expected, local)).toBeCloseTo(2 / 3);
  });

  it('turns a legend into colored shift types', () => {
    const types = legendToTypes([
      { code: 'p1', name: 'Pomeriggio', kind: 'work', segments: [{ start: '8:00', end: '12' }], unpaidBreakMin: 0 },
      { code: 'GV', name: 'Ferie', kind: 'vacation', segments: [], unpaidBreakMin: 0 },
    ]);
    expect(types[0]).toMatchObject({ code: 'P1', segments: [{ start: '08:00', end: '12:00' }], source: 'ai' });
    expect(types[1].color).toBe('emerald');
  });
});
