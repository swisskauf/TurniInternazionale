import type { PeriodSummary } from './hours';
import type { PayDeduction, PayExtra, PayProfile } from './types';

export function roundStep(value: number, step: number): number {
  if (!step || step <= 0) return Math.round(value * 100) / 100;
  const r = Math.round((value + Number.EPSILON) / step) * step;
  return Math.round(r * 100) / 100;
}

export type PayLineKey =
  | 'base' | 'overtime' | 'vacation' | 'holidayAllowance' | 'thirteenth'
  | 'night' | 'sunday' | 'saturday' | 'holidayWork' | 'extra' | 'deduction';

export interface PayLine {
  key: PayLineKey;
  /** Custom label for extras/deductions. */
  label?: string;
  amount: number;
  /** Quantity (hours) for hour-based lines. */
  hours?: number;
  /** Hourly rate or percentage used. */
  rate?: number;
  pct?: number;
  /** The amount the percentage was applied to. */
  base?: number;
  social?: boolean;
}

export interface PayResult {
  currency: string;
  hourlyRate: number;
  paidHours: number;
  earnings: PayLine[];
  deductions: PayLine[];
  baseWage: number;
  socialGross: number;
  gross: number;
  totalDeductions: number;
  net: number;
}

/** Hourly equivalent of a monthly salary given contract weekly hours. */
export function hourlyEquivalent(profile: PayProfile, weeklyHours: number): number {
  if (profile.mode === 'hourly') return profile.hourlyRate;
  const monthlyHours = (weeklyHours || 42) * 52 / 12;
  return monthlyHours > 0 ? profile.monthlySalary / monthlyHours : 0;
}

export function calculatePay(summary: PeriodSummary, profile: PayProfile, weeklyHours: number): PayResult {
  const r = (v: number) => roundStep(v, profile.rounding);
  const rate = hourlyEquivalent(profile, weeklyHours);
  const workedH = summary.workedMin / 60;
  const creditedH = summary.creditedMin / 60;
  const earnings: PayLine[] = [];
  const sp = profile.supplements;
  const al = profile.allowances;

  let baseWage: number;
  let paidHours: number;
  if (profile.mode === 'hourly') {
    paidHours = workedH + creditedH;
    baseWage = r(paidHours * rate);
    earnings.push({ key: 'base', amount: baseWage, hours: paidHours, rate, social: true });
  } else {
    paidHours = workedH + creditedH;
    baseWage = r(profile.monthlySalary);
    earnings.push({ key: 'base', amount: baseWage, social: true });
  }

  const overtimeH = summary.overtimeMin / 60;
  if (sp.overtimeRule !== 'none' && overtimeH > 0) {
    // Hourly workers already get the hours in the base: only the premium is added.
    const factor = profile.mode === 'hourly' ? sp.overtimePct / 100 : 1 + sp.overtimePct / 100;
    const amount = r(overtimeH * rate * factor);
    if (amount) earnings.push({ key: 'overtime', amount, hours: overtimeH, rate, pct: sp.overtimePct, social: true });
  }

  const vacation = r(baseWage * (al.vacationPct / 100));
  if (al.vacationPct) earnings.push({ key: 'vacation', amount: vacation, pct: al.vacationPct, base: baseWage, social: true });
  const holidayAllowance = r(baseWage * (al.holidayPct / 100));
  if (al.holidayPct) earnings.push({ key: 'holidayAllowance', amount: holidayAllowance, pct: al.holidayPct, base: baseWage, social: true });
  if (al.thirteenthPct) {
    const base13 = al.thirteenthOn === 'base-allowances' ? baseWage + vacation + holidayAllowance : baseWage;
    earnings.push({ key: 'thirteenth', amount: r(base13 * (al.thirteenthPct / 100)), pct: al.thirteenthPct, base: base13, social: true });
  }

  const supplement = (key: PayLineKey, minutes: number, pct: number) => {
    if (!pct || !minutes) return;
    const hours = minutes / 60;
    const amount = r(hours * rate * (pct / 100));
    if (amount) earnings.push({ key, amount, hours, rate, pct, social: true });
  };
  supplement('sunday', summary.sundayMin, sp.sundayPct);
  supplement('saturday', summary.saturdayMin, sp.saturdayPct);
  supplement('night', summary.nightMin, sp.nightPct);
  supplement('holidayWork', summary.holidayMin, sp.holidayPct);

  for (const ex of profile.extras) {
    const amount = extraAmount(ex, workedH, baseWage, r);
    if (amount) earnings.push({ key: 'extra', label: ex.label, amount, rate: ex.type === 'per-hour' ? ex.amount : undefined, pct: ex.type === 'percent-base' ? ex.amount : undefined, hours: ex.type === 'per-hour' ? (ex.maxHours > 0 ? Math.min(workedH, ex.maxHours) : workedH) : undefined, social: ex.social });
  }

  const socialGross = r(earnings.filter((e) => e.social).reduce((s, e) => s + e.amount, 0));
  const gross = r(earnings.reduce((s, e) => s + e.amount, 0));

  const deductions: PayLine[] = profile.deductions
    .map((d) => {
      const base = deductionBase(d, socialGross, baseWage, gross);
      const amount = r(base * d.baseFactor * (d.pct / 100) + (d.fixed || 0));
      return { key: 'deduction' as const, label: d.label, amount, pct: d.pct, base: r(base * d.baseFactor) };
    })
    .filter((d) => d.amount !== 0);
  const totalDeductions = r(deductions.reduce((s, d) => s + d.amount, 0));
  const net = r(gross - totalDeductions);

  return {
    currency: profile.currency,
    hourlyRate: rate,
    paidHours,
    earnings,
    deductions,
    baseWage,
    socialGross,
    gross,
    totalDeductions,
    net,
  };
}

function extraAmount(ex: PayExtra, workedH: number, baseWage: number, r: (v: number) => number): number {
  switch (ex.type) {
    case 'per-hour':
      return r((ex.maxHours > 0 ? Math.min(workedH, ex.maxHours) : workedH) * ex.amount);
    case 'fixed':
      return r(ex.amount);
    case 'percent-base':
      return r(baseWage * (ex.amount / 100));
  }
}

function deductionBase(d: PayDeduction, socialGross: number, baseWage: number, gross: number): number {
  if (d.base === 'base') return baseWage;
  if (d.base === 'gross') return gross;
  return socialGross;
}
