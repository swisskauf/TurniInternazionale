/** ISO calendar date, `YYYY-MM-DD` (local, no timezone). */
export type ISODate = string;
/** Clock time `HH:mm`; an end earlier than its start means the segment crosses midnight. */
export type HM = string;

export type DayKind = 'work' | 'rest' | 'vacation' | 'sick' | 'holiday' | 'training' | 'other';

export const DAY_KINDS: DayKind[] = ['work', 'rest', 'vacation', 'sick', 'holiday', 'training', 'other'];

export type ShiftColor =
  | 'red' | 'orange' | 'amber' | 'lime' | 'emerald' | 'teal'
  | 'sky' | 'blue' | 'indigo' | 'violet' | 'fuchsia' | 'slate';

export const SHIFT_COLORS: ShiftColor[] = [
  'blue', 'indigo', 'violet', 'fuchsia', 'red', 'orange',
  'amber', 'lime', 'emerald', 'teal', 'sky', 'slate',
];

export interface Segment {
  start: HM;
  end: HM;
}

/** A shift definition the plan uses, e.g. `P1 = 08:00–12:00 + 12:36–17:18`. */
export interface ShiftType {
  id: string;
  code: string;
  name: string;
  kind: DayKind;
  color: ShiftColor;
  segments: Segment[];
  /** Unpaid break taken inside the segments (minutes). */
  unpaidBreakMin: number;
  /** Hours credited for absences (e.g. vacation day = 8.4h). 0 = none. */
  creditedHours: number;
  /** Alternative spellings the recognizer accepts (OCR variants, synonyms). */
  aliases: string[];
  source: 'manual' | 'ai' | 'local' | 'example';
  archived?: boolean;
  createdAt: number;
  updatedAt: number;
}

/** What is planned or worked on a given day. One entry per day. */
export interface ShiftEntry {
  date: ISODate;
  /** Linked shift type; undefined for unknown codes or one-off custom shifts. */
  typeId?: string;
  /** Raw code as written on the plan (kept for unknown codes and audit). */
  code: string;
  /** Overrides the type's segments (custom shift or actual worked times). */
  segments?: Segment[];
  unpaidBreakMin?: number;
  /** Overrides the type's kind for custom entries. */
  kind?: DayKind;
  note?: string;
  origin: 'manual' | 'import' | 'ai' | 'pattern' | 'clock';
  /** True when the user changed what the plan said; imports won't overwrite it. */
  manual?: boolean;
  /** Set when a later import changed this day, holding the previous code. */
  changedFrom?: string;
  /** Running punch-clock start (`HH:mm`) while a shift is being clocked. */
  clockIn?: string;
  importId?: string;
  updatedAt: number;
}

export type HoursFormat = 'decimal' | 'hm';
export type Locale = 'it' | 'en' | 'de' | 'fr';
export type Country = 'CH' | 'IT' | 'DE' | 'FR' | 'AT' | 'OTHER';

export interface Profile {
  name: string;
  employer: string;
  employeeId: string;
  department: string;
  locale: Locale;
  country: Country;
  /** Canton / region code used for public holidays (e.g. `TI`). */
  region: string;
  theme: 'system' | 'light' | 'dark';
  hoursFormat: HoursFormat;
  /** Contract hours per week, used for targets and overtime. 0 = none. */
  weeklyHours: number;
  /** Working days per week the target is spread over. */
  workDaysPerWeek: number;
  /** Extra non-working holidays chosen by the user. */
  customHolidays: { date: ISODate; name: string }[];
  /** Dates the user removed from the automatic holiday list. */
  ignoredHolidays: ISODate[];
  clockEnabled: boolean;
  reminders: { enabled: boolean; minutesBefore: number };
  onboarded: boolean;
}

// ---------------------------------------------------------------------------
// Pay
// ---------------------------------------------------------------------------

export type DeductionBase = 'social' | 'base' | 'gross';

export interface PayExtra {
  id: string;
  label: string;
  type: 'per-hour' | 'fixed' | 'percent-base';
  amount: number;
  /** For per-hour extras: max hours per period (0 = unlimited). */
  maxHours: number;
  /** Whether it is subject to social contributions (part of the "social" base). */
  social: boolean;
}

export interface PayDeduction {
  id: string;
  label: string;
  pct: number;
  base: DeductionBase;
  /** Share of the base used, e.g. 0.5 when only half the wage is insured. */
  baseFactor: number;
  /** Fixed amount per period, added on top of the percentage. */
  fixed: number;
}

export interface PayProfile {
  configured: boolean;
  source: 'wizard' | 'payslip' | 'example';
  currency: string;
  /** Rounding step for each line (0.05 for CHF, 0.01 otherwise). */
  rounding: number;
  mode: 'hourly' | 'monthly';
  hourlyRate: number;
  monthlySalary: number;
  supplements: {
    nightPct: number;
    nightStart: HM;
    nightEnd: HM;
    sundayPct: number;
    saturdayPct: number;
    holidayPct: number;
    overtimePct: number;
    /** Overtime counted above the contract hours per week, per day, or not at all. */
    overtimeRule: 'none' | 'weekly' | 'daily';
    overtimeDailyHours: number;
  };
  allowances: {
    vacationPct: number;
    holidayPct: number;
    thirteenthPct: number;
    /** Base of the 13th: base wage only, or base + vacation + holiday allowances. */
    thirteenthOn: 'base' | 'base-allowances';
  };
  extras: PayExtra[];
  deductions: PayDeduction[];
  /** Pay period starts on this day of month (1 = calendar month). */
  periodStartDay: number;
  /** Day of the month the salary is paid. */
  payday: number;
  /** Paid in the month after the period (true) or the same month. */
  paidNextMonth: boolean;
  updatedAt: number;
}

/** Figures read from a real payslip, used to compare with the estimate. */
export interface PayslipRecord {
  id: string;
  /** `YYYY-MM` of the pay period it refers to. */
  period: string;
  employer: string;
  currency: string;
  hoursPaid: number;
  gross: number;
  net: number;
  lines: { label: string; amount: number; kind: 'earning' | 'deduction' }[];
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Recognition scripts
// ---------------------------------------------------------------------------

export interface CodeMapping {
  from: string;
  to: string;
}

export interface RecognitionScript {
  id: string;
  name: string;
  description: string;
  createdBy: 'system' | 'ai' | 'manual' | 'local';
  layout: 'grid' | 'list';
  /** Grid header: day numbers (1..31), full dates, or detect automatically. */
  header: 'auto' | 'day-numbers' | 'dates';
  /** Words that identify this plan (fingerprint). Empty = generic. */
  keywords: string[];
  /** Name as written in the plan's row label (grid). */
  personLabel: string;
  personAliases: string[];
  /** Raw text → code fixes (e.g. OCR reading `Pl` for `P1`). */
  codeMap: CodeMapping[];
  /** Tokens to ignore inside cells. */
  ignore: string[];
  /** What an empty cell means. */
  emptyMeans: 'rest' | 'skip';
  /** List layout: regex with named groups (day, month, year, code, start, end, start2, end2). */
  linePattern: string;
  dateOrder: 'DMY' | 'MDY' | 'YMD';
  stats: {
    runs: number;
    lastRunAt: number;
    lastAccuracy: number;
    daysRecognized: number;
  };
  /** OCR/extracted text of the sample the script was built on (for re-testing). */
  sampleText?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ImportLog {
  id: string;
  at: number;
  fileName: string;
  sourceKind: SourceKind;
  scriptId?: string;
  scriptName?: string;
  usedAi: boolean;
  days: number;
  added: number;
  changed: number;
  period: string;
}

export type SourceKind = 'image' | 'pdf' | 'sheet' | 'text';

export interface AiSettings {
  mode: 'cloud' | 'own-key' | 'off';
  apiKey: string;
  model: string;
  usage: {
    requests: number;
    scriptsCreated: number;
    localImports: number;
    aiImports: number;
    lastAt: number;
  };
}
