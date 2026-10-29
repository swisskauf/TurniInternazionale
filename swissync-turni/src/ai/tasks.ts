import { callAi } from './client';
import { uid } from '@/lib/id';
import { runScript, type RecognitionResult, type RecognizedDay } from '@/engine/recognition/run';
import { newScript } from '@/engine/recognition/scripts';
import { groupLines, linesToText, normalizeCode, type PlanDocument } from '@/engine/recognition/tokens';
import { emptyPayProfile } from '@/engine/presets';
import { isISODate } from '@/engine/dates';
import { normalizeHM } from '@/engine/time';
import type {
  DayKind, PayDeduction, PayExtra, PayProfile, PayslipRecord, RecognitionScript, Segment, ShiftColor, ShiftType,
} from '@/engine/types';
import { useStore } from '@/store/store';

export interface AiSegment { start: string; end: string }
export interface AiLegend { code: string; name: string; kind: DayKind; segments: AiSegment[]; unpaidBreakMin: number }
export interface AiScript {
  layout: 'grid' | 'list';
  header: 'auto' | 'day-numbers' | 'dates';
  keywords: string[];
  personLabel: string;
  codeMap: { from: string; to: string }[];
  ignore: string[];
  emptyMeans: 'rest' | 'skip';
  linePattern: string;
  dateOrder: 'DMY' | 'MDY' | 'YMD';
}
export interface AnalyzePlanOutput {
  period: { year: number; month: number };
  people: string[];
  personMatched: string;
  days: { date: string; raw: string; code: string; segments: AiSegment[]; kind: DayKind }[];
  legend: AiLegend[];
  script: AiScript;
  confidence: number;
  notes: string;
}

const cleanSegments = (segs: AiSegment[] = []): Segment[] =>
  segs.map((s) => ({ start: normalizeHM(s.start), end: normalizeHM(s.end) })).filter((s) => s.start && s.end);

function docText(doc: PlanDocument): string {
  // Spreadsheets/text are cheap and exact; OCR text helps the model fill the code map.
  const text = doc.kind === 'sheet' || doc.kind === 'text' ? doc.text : linesToText(groupLines(doc.tokens));
  return text.slice(0, 24000);
}

function knownCodes(types: ShiftType[]) {
  return types.filter((t) => !t.archived).map((t) => ({ code: t.code, aliases: t.aliases, kind: t.kind, segments: t.segments }));
}

export function scriptFromAi(ai: AiScript, doc: PlanDocument, person: string, name?: string): RecognitionScript {
  const keywords = (ai.keywords ?? []).map((k) => k.trim()).filter((k) => k.length >= 3).slice(0, 6);
  return newScript({
    id: uid('scr_'),
    name: name || (keywords.length ? keywords.slice(0, 2).map((k) => k[0].toUpperCase() + k.slice(1).toLowerCase()).join(' ') : doc.fileName.replace(/\.[a-z0-9]+$/i, '')),
    description: '',
    createdBy: 'ai',
    layout: ai.layout === 'list' ? 'list' : 'grid',
    header: ai.header ?? 'auto',
    keywords,
    personLabel: ai.personLabel || '',
    personAliases: person ? [person] : [],
    codeMap: (ai.codeMap ?? []).filter((m) => m.from && m.to && normalizeCode(m.from) !== normalizeCode(m.to)),
    ignore: (ai.ignore ?? []).filter(Boolean),
    emptyMeans: ai.emptyMeans === 'rest' ? 'rest' : 'skip',
    linePattern: ai.layout === 'list' ? ai.linePattern || '' : '',
    dateOrder: ai.dateOrder ?? 'DMY',
    sampleText: docText(doc),
  });
}

/** Share of expected days the local engine reproduces (same code, or same times). */
export function compareDays(expected: { date: string; code: string; segments?: Segment[] }[], local: RecognizedDay[]): number {
  const relevant = expected.filter((d) => d.code || d.segments?.length);
  if (!relevant.length) return 0;
  const byDate = new Map(local.map((d) => [d.date, d]));
  let ok = 0;
  for (const e of relevant) {
    const l = byDate.get(e.date);
    if (!l) continue;
    if (normalizeCode(l.code) === normalizeCode(e.code)) ok++;
    else if (e.segments?.length && JSON.stringify(l.segments) === JSON.stringify(e.segments)) ok++;
  }
  return ok / relevant.length;
}

export interface AnalyzePlanResult {
  ai: AnalyzePlanOutput;
  days: RecognizedDay[];
  legend: AiLegend[];
  script: RecognitionScript;
  local: RecognitionResult;
  accuracy: number;
}

export async function analyzePlanWithAi(doc: PlanDocument, person: string, period?: { year: number; month: number }): Promise<AnalyzePlanResult> {
  const { types, profile } = useStore.getState();
  const typeList = Object.values(types);
  const { data } = await callAi<AnalyzePlanOutput>('analyze-plan', {
    images: doc.images.slice(0, 3),
    text: docText(doc),
    context: {
      person,
      knownCodes: knownCodes(typeList),
      hintPeriod: period ?? null,
      source: doc.kind,
      fileName: doc.fileName,
      country: profile.country,
    },
  });
  const days: RecognizedDay[] = (data.days ?? [])
    .filter((d) => isISODate(d.date))
    .map((d) => {
      const segments = cleanSegments(d.segments);
      const code = normalizeCode(d.code || '');
      const type = typeList.find((t) => !t.archived && [t.code, ...t.aliases].some((k) => normalizeCode(k) === code));
      return {
        date: d.date,
        raw: d.raw ?? d.code,
        code: type?.code ?? (code || (segments.length ? segments.map((s) => `${s.start}-${s.end}`).join(' ') : '')),
        typeId: type?.id,
        segments: segments.length && (!type || JSON.stringify(segments) !== JSON.stringify(type.segments)) ? segments : undefined,
        kind: type ? undefined : d.kind,
        status: type ? 'ok' : segments.length ? 'times' : code ? 'unknown' : 'empty',
        confidence: data.confidence ?? 0.8,
      } satisfies RecognizedDay;
    })
    .filter((d) => d.code || d.kind);
  const script = scriptFromAi(data.script, doc, person);
  const local = runScript(doc, script, { person, types: typeList, period: data.period?.year ? data.period : period });
  const accuracy = compareDays(days, local.days);
  script.stats.lastAccuracy = accuracy;
  return { ai: data, days, legend: (data.legend ?? []).filter((l) => l.code), script, local, accuracy };
}

export async function refineScriptWithAi(script: RecognitionScript, doc: PlanDocument, expected: RecognizedDay[], local: RecognizedDay[]): Promise<{ script: RecognitionScript; notes: string }> {
  const { data } = await callAi<{ script: AiScript; notes: string }>('refine-script', {
    text: docText(doc),
    context: {
      script: {
        layout: script.layout, header: script.header, keywords: script.keywords, personLabel: script.personLabel,
        codeMap: script.codeMap, ignore: script.ignore, emptyMeans: script.emptyMeans, linePattern: script.linePattern, dateOrder: script.dateOrder,
      },
      engineOutput: local.map((d) => ({ date: d.date, raw: d.raw, code: d.code })),
      correct: expected.map((d) => ({ date: d.date, code: d.code, segments: d.segments ?? [] })),
    },
  });
  const updated = scriptFromAi(data.script, doc, script.personAliases[0] ?? '', script.name);
  return { script: { ...script, ...updated, id: script.id, name: script.name, createdAt: script.createdAt, stats: script.stats }, notes: data.notes };
}

const LEGEND_COLORS: ShiftColor[] = ['blue', 'violet', 'indigo', 'teal', 'amber', 'fuchsia', 'sky', 'lime', 'orange', 'red'];
const KIND_COLORS: Partial<Record<DayKind, ShiftColor>> = { rest: 'slate', vacation: 'emerald', sick: 'orange', holiday: 'red', training: 'teal' };

export function legendToTypes(legend: AiLegend[], source: ShiftType['source'] = 'ai'): ShiftType[] {
  const now = Date.now();
  let i = 0;
  return legend.map((l) => ({
    id: uid('t_'),
    code: normalizeCode(l.code),
    name: l.name || l.code,
    kind: l.kind,
    color: KIND_COLORS[l.kind] ?? LEGEND_COLORS[i++ % LEGEND_COLORS.length],
    segments: cleanSegments(l.segments),
    unpaidBreakMin: Math.max(0, Math.round(l.unpaidBreakMin || 0)),
    creditedHours: 0,
    aliases: [],
    source,
    createdAt: now,
    updatedAt: now,
  }));
}

export async function shiftTypesWithAi(input: { text?: string; images?: string[] }): Promise<ShiftType[]> {
  const { types } = useStore.getState();
  const { data } = await callAi<{ types: AiLegend[] }>('shift-types', {
    text: input.text,
    images: input.images,
    context: { existingCodes: knownCodes(Object.values(types)).map((t) => t.code) },
  });
  return legendToTypes(data.types ?? []);
}

// ---------------------------------------------------------------------------
// Payslip
// ---------------------------------------------------------------------------

export interface PayslipOutput {
  employer: string;
  employeeName: string;
  period: { year: number; month: number };
  currency: string;
  payType: 'hourly' | 'monthly';
  hourlyRate: number;
  monthlySalary: number;
  hoursPaid: number;
  earnings: { label: string; category: string; hours: number; rate: number; pct: number; amount: number; social: boolean }[];
  deductions: { label: string; category: string; pct: number; base: 'social' | 'base' | 'gross'; baseFactor: number; amount: number }[];
  gross: number;
  net: number;
  notes: string;
}

export async function readPayslipWithAi(input: { text?: string; images?: string[] }): Promise<PayslipOutput> {
  const { profile } = useStore.getState();
  const { data } = await callAi<PayslipOutput>('payslip', { ...input, context: { country: profile.country } });
  return data;
}

export function payslipToProfile(p: PayslipOutput, current?: PayProfile): PayProfile {
  const base = current?.configured ? current : emptyPayProfile();
  const find = (cat: string) => p.earnings.find((e) => e.category === cat);
  const baseLine = find('base');
  const baseAmount = baseLine?.amount || (p.payType === 'hourly' ? p.hourlyRate * p.hoursPaid : p.monthlySalary);
  const pctOf = (cat: string) => {
    const e = find(cat);
    if (!e) return 0;
    if (e.pct) return e.pct;
    return baseAmount ? Math.round((e.amount / baseAmount) * 10000) / 100 : 0;
  };
  const rate = p.hourlyRate || (baseLine?.rate ?? 0);
  const supplementPct = (cat: string) => {
    const e = find(cat);
    if (!e) return 0;
    if (e.pct) return e.pct;
    return rate && e.hours ? Math.round((e.amount / (e.hours * rate)) * 10000) / 100 : 0;
  };
  const socialGross = p.earnings.filter((e) => e.social).reduce((s, e) => s + e.amount, 0) || p.gross;
  const extras: PayExtra[] = p.earnings
    .filter((e) => e.category === 'extra' && e.amount)
    .map((e) => ({
      id: uid(),
      label: e.label,
      type: e.rate && e.hours ? 'per-hour' : 'fixed',
      amount: e.rate && e.hours ? e.rate : e.amount,
      maxHours: 0,
      social: e.social,
    }));
  const deductions: PayDeduction[] = p.deductions
    .filter((d) => d.amount || d.pct)
    .map((d) => {
      const pct = d.pct || (socialGross ? Math.round((d.amount / socialGross) * 100000) / 1000 : 0);
      return { id: uid(), label: d.label, pct, base: d.base || 'social', baseFactor: d.baseFactor > 0 && d.baseFactor <= 1 ? d.baseFactor : 1, fixed: 0 };
    });
  const currency = (p.currency || base.currency || 'CHF').toUpperCase().slice(0, 3);
  return {
    ...base,
    configured: true,
    source: 'payslip',
    currency,
    rounding: currency === 'CHF' ? 0.05 : 0.01,
    mode: p.payType,
    hourlyRate: rate || base.hourlyRate,
    monthlySalary: p.monthlySalary || base.monthlySalary,
    supplements: {
      ...base.supplements,
      nightPct: supplementPct('night'),
      sundayPct: supplementPct('sunday'),
      saturdayPct: supplementPct('saturday'),
      holidayPct: supplementPct('holidayWork'),
      overtimePct: supplementPct('overtime') || base.supplements.overtimePct,
      overtimeRule: find('overtime') ? (base.supplements.overtimeRule === 'none' ? 'weekly' : base.supplements.overtimeRule) : base.supplements.overtimeRule,
    },
    allowances: {
      vacationPct: pctOf('vacation'),
      holidayPct: pctOf('holiday'),
      thirteenthPct: pctOf('thirteenth'),
      thirteenthOn: base.allowances.thirteenthOn,
    },
    extras,
    deductions,
    updatedAt: Date.now(),
  };
}

export function payslipRecord(p: PayslipOutput): PayslipRecord {
  const period = p.period?.year ? `${p.period.year}-${String(p.period.month).padStart(2, '0')}` : new Date().toISOString().slice(0, 7);
  return {
    id: uid('ps_'),
    period,
    employer: p.employer,
    currency: p.currency,
    hoursPaid: p.hoursPaid,
    gross: p.gross,
    net: p.net,
    lines: [
      ...p.earnings.map((e) => ({ label: e.label, amount: e.amount, kind: 'earning' as const })),
      ...p.deductions.map((d) => ({ label: d.label, amount: d.amount, kind: 'deduction' as const })),
    ],
    createdAt: Date.now(),
  };
}
