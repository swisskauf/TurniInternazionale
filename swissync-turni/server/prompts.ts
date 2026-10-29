/**
 * Fixed AI tasks of Swissync Turni. The endpoint only runs these, with bounded inputs and strict
 * JSON schemas, so it cannot be used as a general-purpose proxy for the xAI key.
 */

export type AiTask = 'analyze-plan' | 'refine-script' | 'shift-types' | 'payslip';

type Json = Record<string, unknown>;

const str = (description?: string): Json => ({ type: 'string', ...(description ? { description } : {}) });
const num = (description?: string): Json => ({ type: 'number', ...(description ? { description } : {}) });
const int = (description?: string): Json => ({ type: 'integer', ...(description ? { description } : {}) });
const bool = (description?: string): Json => ({ type: 'boolean', ...(description ? { description } : {}) });
const arr = (items: Json, description?: string): Json => ({ type: 'array', items, ...(description ? { description } : {}) });
const enm = (values: string[], description?: string): Json => ({ type: 'string', enum: values, ...(description ? { description } : {}) });
const obj = (properties: Record<string, Json>, description?: string): Json => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
  ...(description ? { description } : {}),
});

const KINDS = ['work', 'rest', 'vacation', 'sick', 'holiday', 'training', 'other'];

const SEGMENT = obj({ start: str('HH:MM, 24h'), end: str('HH:MM, 24h; earlier than start when the shift ends after midnight') });

const SCRIPT = obj({
  layout: enm(['grid', 'list'], 'grid = table with people and days; list = one line per day'),
  header: enm(['auto', 'day-numbers', 'dates'], 'what the grid header shows for each day column'),
  keywords: arr(str(), '2-5 words printed on this plan every period (company, department, title). No month names, no person names, no numbers.'),
  personLabel: str('the person row label exactly as printed in the plan (e.g. "ROSSI M.")'),
  codeMap: arr(obj({ from: str('text as the OCR read it'), to: str('correct shift code') }), 'OCR misreadings to fix'),
  ignore: arr(str(), 'decorative tokens inside cells to ignore'),
  emptyMeans: enm(['rest', 'skip'], 'rest = an empty cell means day off'),
  linePattern: str('list layout only: JavaScript regex with named groups day, month, year, code, start, end, start2, end2. Empty string for grids.'),
  dateOrder: enm(['DMY', 'MDY', 'YMD']),
});

const DAY = obj({
  date: str('YYYY-MM-DD'),
  raw: str('cell text exactly as written (handwriting included)'),
  code: str('normalized shift code; a known code when it matches; empty for an empty cell'),
  segments: arr(SEGMENT, 'times written in the cell, otherwise empty'),
  kind: enm(KINDS),
});

const LEGEND = obj({
  code: str(),
  name: str('short descriptive name in the user language'),
  kind: enm(KINDS),
  segments: arr(SEGMENT),
  unpaidBreakMin: int('unpaid break minutes inside the segments, 0 if unknown'),
});

export const SCHEMAS: Record<AiTask, Json> = {
  'analyze-plan': obj({
    period: obj({ year: int(), month: int('1-12') }),
    people: arr(str(), 'all person names / row labels in the plan'),
    personMatched: str('row label matched to the requested person, empty if not found'),
    days: arr(DAY),
    legend: arr(LEGEND, 'shift codes with times shown in the plan legend, or inferred from cells with times'),
    script: SCRIPT,
    confidence: num('0..1'),
    notes: str('short note for the user in their language, empty if nothing relevant'),
  }),
  'refine-script': obj({
    script: SCRIPT,
    notes: str('what was changed, in the user language'),
  }),
  'shift-types': obj({
    types: arr(LEGEND),
  }),
  payslip: obj({
    employer: str(),
    employeeName: str(),
    period: obj({ year: int(), month: int('1-12, the month the work refers to') }),
    currency: str('ISO code, e.g. CHF, EUR'),
    payType: enm(['hourly', 'monthly']),
    hourlyRate: num('0 if not hourly'),
    monthlySalary: num('0 if hourly'),
    hoursPaid: num('total paid hours, 0 if not shown'),
    earnings: arr(obj({
      label: str(),
      category: enm(['base', 'vacation', 'holiday', 'thirteenth', 'night', 'sunday', 'saturday', 'holidayWork', 'overtime', 'extra']),
      hours: num(),
      rate: num('hourly rate used, 0 if none'),
      pct: num('percentage shown, e.g. 10.64; 0 if none'),
      amount: num(),
      social: bool('subject to social contributions (AVS/AHV etc.)'),
    })),
    deductions: arr(obj({
      label: str(),
      category: enm(['avs', 'ad', 'ainf', 'igm', 'lpp', 'tax', 'other']),
      pct: num('employee percentage, e.g. 5.3; 0 if only an amount is shown'),
      base: enm(['social', 'base', 'gross'], 'social = gross subject to contributions; base = base wage; gross = total gross'),
      baseFactor: num('share of the base used (1, or e.g. 0.5); 1 if unsure'),
      amount: num(),
    })),
    gross: num(),
    net: num(),
    notes: str('in the user language; mention values you could not read'),
  }),
};

const LANG: Record<string, string> = { it: 'Italian', en: 'English', de: 'German', fr: 'French' };

const ENGINE = `The local engine (no AI) works on positioned words (OCR words, PDF text or spreadsheet cells):
- grid: finds the header line with consecutive day numbers (or dates), finds the row whose label matches the person (fuzzy), and reads the words under each day column down to the next labelled row. It also handles transposed grids (days in rows, people in columns).
- list: reads one line per day: a date (dd.mm[.yyyy], yyyy-mm-dd, "3 nov", or weekday + day number) followed by a shift code or time ranges.
- Cell text is matched against known shift codes and their aliases, after applying codeMap; OCR-confusable characters (O/0, I/l/1, S/5, B/8) are tolerated.
- The month comes from the plan heading (e.g. "Novembre 2026") or from full dates.`;

export function systemPrompt(task: AiTask, locale: string): string {
  const lang = LANG[locale] ?? 'Italian';
  const common = `You are the document-analysis engine of "Swissync Turni", an app that tracks working hours from shift plans. Answer only with JSON matching the schema. Write human-readable texts (names, notes) in ${lang}. Never invent data: use empty strings, empty arrays or 0 when a value is not present.`;
  switch (task) {
    case 'analyze-plan':
      return `${common}
You receive a shift plan (photo, scan, PDF or spreadsheet text), the requested person and the shift codes the user already defined.
1. Determine the month and year of the plan.
2. Extract the requested person's shift for every day: raw cell text, normalized code (prefer the user's known codes; handwritten corrections override printed text; palm-tree or vacation symbols mean vacation), times if written in the cell.
3. List the legend: every code with its times when the plan shows them (or when cells contain both code and times).
4. Design a reusable recognition script for this plan layout. It will run locally, WITHOUT AI, on future versions of the same plan, so it must capture what is stable about the layout.
${ENGINE}
Use the OCR text (when provided) to fill codeMap with the misreadings the local OCR actually produced for codes in the person's row.`;
    case 'refine-script':
      return `${common}
A recognition script produced wrong results on a plan. You receive the script, the document text the local engine saw, what the engine produced and the correct values confirmed by the user. Return an improved script so that the local engine reproduces the correct values on this and future plans of the same layout.
${ENGINE}`;
    case 'shift-types':
      return `${common}
Extract shift definitions (codes, names, kind, time segments, unpaid break) from the legend, photo or description provided. A split shift has several segments. "Riposo/Frei/Repos/Off" is kind rest; vacation/ferie/Ferien/congé is vacation; sick/malattia/krank/maladie is sick.`;
    case 'payslip':
      return `${common}
Read the payslip and return its figures so the app can rebuild the user's pay profile. Swiss labels: AVS/AHV/AVS-AI-IPG → avs, AD/ALV/AC → ad, AINF/NBU/AANP → ainf, IGM/KTG/IJM (sickness daily allowance) → igm, LPP/BVG → lpp, imposta alla fonte/Quellensteuer/impôt à la source/IRPEF → tax. Vacation, holiday and 13th-salary allowances are usually percentages of the base wage. For deductions computed on a reduced base (e.g. LPP on a coordinated salary) estimate baseFactor as used base / base wage.`;
  }
}

export interface AiInput {
  images?: string[];
  text?: string;
  context?: Record<string, unknown>;
}

export function userContent(task: AiTask, input: AiInput): unknown[] {
  const parts: unknown[] = [];
  const ctx = JSON.stringify(input.context ?? {}, null, 0);
  let intro = '';
  switch (task) {
    case 'analyze-plan':
      intro = `Context (requested person, known codes, hints): ${ctx}`;
      break;
    case 'refine-script':
      intro = `Current script, engine output and correct values: ${ctx}`;
      break;
    case 'shift-types':
      intro = `Context: ${ctx}`;
      break;
    case 'payslip':
      intro = `Context: ${ctx}`;
      break;
  }
  parts.push({ type: 'text', text: intro });
  if (input.text) {
    parts.push({ type: 'text', text: `Document text${task === 'analyze-plan' || task === 'refine-script' ? ' (local OCR/extraction, may contain errors)' : ''}:\n${input.text}` });
  }
  for (const url of input.images ?? []) {
    parts.push({ type: 'image_url', image_url: { url, detail: 'high' } });
  }
  return parts;
}
