import { uid } from '../lib/id';
import type { Locale, PayDeduction, PayExtra, PayProfile, ShiftColor, ShiftType, DayKind, Segment } from './types';

type L10n = Record<Locale, string>;
const tr = (l: L10n, locale: Locale) => l[locale] ?? l.it;

const LABELS = {
  avs: { it: 'AVS/AI/IPG', en: 'AHV/IV/EO (OASI)', de: 'AHV/IV/EO', fr: 'AVS/AI/APG' },
  ad: { it: 'AD (disoccupazione)', en: 'ALV (unemployment)', de: 'ALV', fr: 'AC (chômage)' },
  ainf: { it: 'AINF (infortuni non prof.)', en: 'NBU (non-occup. accident)', de: 'NBU', fr: 'AANP' },
  igm: { it: 'IGM (perdita di guadagno malattia)', en: 'KTG (sickness insurance)', de: 'KTG', fr: 'IJM (perte de gain maladie)' },
  lpp: { it: 'LPP (cassa pensione)', en: 'BVG (pension fund)', de: 'BVG (Pensionskasse)', fr: 'LPP (caisse de pension)' },
  tax: { it: 'Imposta alla fonte', en: 'Withholding tax', de: 'Quellensteuer', fr: 'Impôt à la source' },
  clothing: { it: 'Indennità vestiario', en: 'Clothing allowance', de: 'Kleiderzulage', fr: 'Indemnité vêtements' },
  inps: { it: 'Contributi INPS', en: 'Social security (INPS)', de: 'Sozialversicherung (INPS)', fr: 'Cotisations INPS' },
  irpef: { it: 'IRPEF stimata', en: 'Estimated income tax', de: 'Geschätzte Einkommensteuer', fr: 'Impôt sur le revenu estimé' },
} satisfies Record<string, L10n>;

const ded = (label: string, pct: number, base: PayDeduction['base'] = 'social', baseFactor = 1): PayDeduction => ({
  id: uid(), label, pct, base, baseFactor, fixed: 0,
});

export function emptyPayProfile(): PayProfile {
  return {
    configured: false,
    source: 'wizard',
    currency: 'CHF',
    rounding: 0.05,
    mode: 'hourly',
    hourlyRate: 0,
    monthlySalary: 0,
    supplements: {
      nightPct: 0, nightStart: '23:00', nightEnd: '06:00', sundayPct: 0, saturdayPct: 0, holidayPct: 0,
      overtimePct: 25, overtimeRule: 'none', overtimeDailyHours: 0,
    },
    allowances: { vacationPct: 0, holidayPct: 0, thirteenthPct: 0, thirteenthOn: 'base' },
    extras: [],
    deductions: [],
    periodStartDay: 1,
    payday: 25,
    paidNextMonth: false,
    updatedAt: Date.now(),
  };
}

export type PayPresetId = 'ch-hourly' | 'ch-monthly' | 'it-monthly' | 'generic';

export function payPreset(id: PayPresetId, locale: Locale): PayProfile {
  const base = emptyPayProfile();
  switch (id) {
    case 'ch-hourly':
      return {
        ...base,
        currency: 'CHF',
        rounding: 0.05,
        mode: 'hourly',
        hourlyRate: 25,
        supplements: { ...base.supplements, nightPct: 10, sundayPct: 50 },
        allowances: { vacationPct: 10.64, holidayPct: 3.59, thirteenthPct: 8.33, thirteenthOn: 'base-allowances' },
        deductions: [
          ded(tr(LABELS.avs, locale), 5.3),
          ded(tr(LABELS.ad, locale), 1.1),
          ded(tr(LABELS.ainf, locale), 1.5),
          ded(tr(LABELS.igm, locale), 0.5),
        ],
        payday: 25,
      };
    case 'ch-monthly':
      return {
        ...base,
        currency: 'CHF',
        rounding: 0.05,
        mode: 'monthly',
        monthlySalary: 5000,
        supplements: { ...base.supplements, nightPct: 10, sundayPct: 50, overtimeRule: 'weekly', overtimePct: 25 },
        allowances: { vacationPct: 0, holidayPct: 0, thirteenthPct: 8.33, thirteenthOn: 'base' },
        deductions: [
          ded(tr(LABELS.avs, locale), 5.3),
          ded(tr(LABELS.ad, locale), 1.1),
          ded(tr(LABELS.ainf, locale), 1.5),
          ded(tr(LABELS.igm, locale), 0.5),
          ded(tr(LABELS.lpp, locale), 6),
        ],
        payday: 25,
      };
    case 'it-monthly':
      return {
        ...base,
        currency: 'EUR',
        rounding: 0.01,
        mode: 'monthly',
        monthlySalary: 1800,
        supplements: { ...base.supplements, nightPct: 15, sundayPct: 30, holidayPct: 30, overtimeRule: 'weekly', overtimePct: 25 },
        allowances: { vacationPct: 0, holidayPct: 0, thirteenthPct: 8.33, thirteenthOn: 'base' },
        deductions: [ded(tr(LABELS.inps, locale), 9.19), ded(tr(LABELS.irpef, locale), 15, 'gross')],
        payday: 27,
      };
    case 'generic':
      return { ...base, currency: 'EUR', rounding: 0.01, mode: 'hourly', hourlyRate: 15 };
  }
}

/** The pay setup of the original ScattaTurni app (Swiss retail, hourly), kept as an example. */
export function legacyScattaTurniProfile(locale: Locale): PayProfile {
  const base = emptyPayProfile();
  const clothing: PayExtra = { id: uid(), label: tr(LABELS.clothing, locale), type: 'per-hour', amount: 0.25, maxHours: 154.5, social: false };
  return {
    ...base,
    configured: true,
    source: 'example',
    currency: 'CHF',
    rounding: 0.05,
    mode: 'hourly',
    hourlyRate: 19.75,
    supplements: { ...base.supplements, nightPct: 10, sundayPct: 25, nightStart: '23:00', nightEnd: '06:00' },
    allowances: { vacationPct: 10.65, holidayPct: 2.27, thirteenthPct: 8.33, thirteenthOn: 'base-allowances' },
    extras: [clothing],
    deductions: [
      ded(tr(LABELS.avs, locale), 5.3),
      ded(tr(LABELS.ad, locale), 1.1),
      ded(tr(LABELS.igm, locale), 1.445),
      ded(tr(LABELS.ainf, locale), 1.672),
      ded(tr(LABELS.lpp, locale), 1, 'base', 0.5),
      ded(tr(LABELS.tax, locale), 3, 'gross'),
    ],
    payday: 6,
    paidNextMonth: true,
  };
}

function type(code: string, name: string, kind: DayKind, color: ShiftColor, segments: Segment[] = [], extra: Partial<ShiftType> = {}): ShiftType {
  const now = Date.now();
  return { id: uid(), code, name, kind, color, segments, unpaidBreakMin: 0, creditedHours: 0, aliases: [], source: 'example', createdAt: now, updatedAt: now, ...extra };
}

/** A small starter set so the first manual entries are one tap away. */
export function starterTypes(locale: Locale): ShiftType[] {
  const names: Record<Locale, [string, string, string, string, string, string]> = {
    it: ['Mattina', 'Pomeriggio', 'Notte', 'Riposo', 'Ferie', 'Malattia'],
    en: ['Morning', 'Afternoon', 'Night', 'Day off', 'Vacation', 'Sick leave'],
    de: ['Frühdienst', 'Spätdienst', 'Nachtdienst', 'Frei', 'Ferien', 'Krank'],
    fr: ['Matin', 'Après-midi', 'Nuit', 'Repos', 'Vacances', 'Maladie'],
  };
  const codes: Record<Locale, [string, string, string, string, string, string]> = {
    it: ['M', 'P', 'N', 'R', 'F', 'MAL'],
    en: ['AM', 'PM', 'N', 'OFF', 'VAC', 'SICK'],
    de: ['F', 'S', 'N', 'X', 'U', 'K'],
    fr: ['M', 'S', 'N', 'R', 'C', 'MAL'],
  };
  const n = names[locale];
  const c = codes[locale];
  return [
    type(c[0], n[0], 'work', 'sky', [{ start: '06:00', end: '14:30' }], { unpaidBreakMin: 30 }),
    type(c[1], n[1], 'work', 'violet', [{ start: '14:00', end: '22:30' }], { unpaidBreakMin: 30 }),
    type(c[2], n[2], 'work', 'indigo', [{ start: '22:00', end: '06:30' }], { unpaidBreakMin: 30 }),
    type(c[3], n[3], 'rest', 'slate'),
    type(c[4], n[4], 'vacation', 'emerald'),
    type(c[5], n[5], 'sick', 'orange'),
  ].map((t) => ({ ...t, source: 'manual' as const }));
}

/** The original plan codes of ScattaTurni, used by the demo and the tests. */
export function legacyTypes(): ShiftType[] {
  return [
    type('P1', 'P1', 'work', 'blue', [{ start: '08:00', end: '12:00' }, { start: '12:36', end: '17:18' }]),
    type('P2', 'P2', 'work', 'indigo', [{ start: '09:00', end: '12:00' }, { start: '12:36', end: '18:18' }]),
    type('P3', 'P3', 'work', 'violet', [{ start: '09:00', end: '12:00' }, { start: '12:36', end: '17:18' }]),
    type('MP1', 'MP1', 'work', 'sky', [{ start: '08:00', end: '12:00' }]),
    type('MP2', 'MP2', 'work', 'teal', [{ start: '09:00', end: '12:00' }]),
    type('R+MP1', 'R+MP1', 'work', 'amber', [{ start: '05:00', end: '07:30' }, { start: '08:00', end: '12:00' }]),
    type('R+MP2', 'R+MP2', 'work', 'orange', [{ start: '05:00', end: '07:30' }, { start: '09:00', end: '12:00' }]),
    type('R+P1', 'R+P1', 'work', 'fuchsia', [{ start: '05:00', end: '07:30' }, { start: '08:00', end: '12:00' }, { start: '12:36', end: '15:12' }]),
    type('R+P2', 'R+P2', 'work', 'red', [{ start: '05:00', end: '07:30' }, { start: '09:00', end: '12:00' }, { start: '12:36', end: '15:12' }]),
    type('AN', 'AN', 'work', 'lime', [{ start: '05:00', end: '07:30' }]),
    type('GR', 'Giorno di riposo', 'rest', 'slate'),
    type('GV', 'Vacanza', 'vacation', 'emerald'),
  ];
}
