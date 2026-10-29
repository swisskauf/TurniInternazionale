import { useMemo, useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { AlertTriangle, CalendarPlus, ChevronLeft, ChevronRight, FileDown, FileSpreadsheet, Moon, Plane, Scale, Sun, Timer, TrendingUp } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, PageHeader, SectionTitle, Stat } from '@/components/ui/Card';
import { Field, Input, Segmented, Switch, Select } from '@/components/ui/Form';
import { Sheet } from '@/components/ui/Sheet';
import { EmptyState, toast } from '@/components/ui/Feedback';
import { ShiftChip } from '@/components/ShiftChip';
import { useDayEditor } from '@/features/day/DayEditor';
import { useSummary, useToday } from '@/app/hooks';
import { navigate, useRoute } from '@/app/router';
import { addDays, addMonths, fmtDateCH, fromISO, monthRange, payPeriodByLabel, payPeriodFor, startOfWeek, weekdayIndex, shiftMonthLabel } from '@/engine/dates';
import { fmtSegments } from '@/engine/time';
import type { ISODate, Locale } from '@/engine/types';
import { useStore } from '@/store/store';
import { LOCALE_NAMES, useT } from '@/i18n';
import { useFmt } from '@/lib/format';
import { saveFile } from '@/lib/files';
import { buildIcs } from '@/lib/ics';
import { cn } from '@/lib/cn';

type Mode = 'month' | 'pay' | 'week' | 'range';

export function HoursPage() {
  const t = useT();
  const f = useFmt();
  const today = useToday();
  const { params } = useRoute();
  const profile = useStore((s) => s.profile);
  const types = useStore((s) => s.types);
  const pay = useStore((s) => s.pay);
  const openDay = useDayEditor((s) => s.open);
  const [mode, setMode] = useState<Mode>('month');
  const [anchor, setAnchor] = useState<ISODate>(params.get('month') ? `${params.get('month')}-01` : today);
  const [rangeStart, setRangeStart] = useState(addDays(today, -30));
  const [rangeEnd, setRangeEnd] = useState(today);
  const [reportOpen, setReportOpen] = useState(false);

  const { start, end, title } = useMemo(() => {
    const d = fromISO(anchor);
    switch (mode) {
      case 'month': {
        const r = monthRange(d.getFullYear(), d.getMonth() + 1);
        return { ...r, title: f.dateCap(r.start, 'LLLL yyyy') };
      }
      case 'pay': {
        const r = payPeriodFor(anchor, pay.periodStartDay);
        return { ...r, title: pay.periodStartDay > 1 ? `${f.date(r.start, 'd MMM')} – ${f.date(r.end, 'd MMM yyyy')}` : f.dateCap(r.start, 'LLLL yyyy') };
      }
      case 'week': {
        const s = startOfWeek(anchor);
        return { start: s, end: addDays(s, 6), title: `${f.date(s, 'd MMM')} – ${f.date(addDays(s, 6), 'd MMM yyyy')}` };
      }
      default:
        return { start: rangeStart <= rangeEnd ? rangeStart : rangeEnd, end: rangeEnd >= rangeStart ? rangeEnd : rangeStart, title: `${fmtDateCH(rangeStart)} – ${fmtDateCH(rangeEnd)}` };
    }
  }, [anchor, mode, pay.periodStartDay, rangeStart, rangeEnd, f]);

  const s = useSummary(start, end);
  const step = (n: number) => {
    if (mode === 'week') setAnchor(addDays(anchor, 7 * n));
    else if (mode === 'pay') setAnchor(payPeriodByLabel(shiftMonthLabel(payPeriodFor(anchor, pay.periodStartDay).label, n), pay.periodStartDay).start);
    else setAnchor(addMonths(anchor, n));
  };

  const chartData = useMemo(
    () => s.days.map((d) => ({ date: d.date, day: fromISO(d.date).getDate(), hours: Math.round(((d.workedMin + d.creditedMin) / 60) * 100) / 100, code: d.code, holiday: !!d.holiday, sunday: weekdayIndex(d.date) === 6 })),
    [s.days],
  );
  const absences = s.kindCounts.vacation + s.kindCounts.sick;

  const exportCsv = async () => {
    const rows = [['date', 'weekday', 'code', 'name', 'times', 'break_min', 'worked_h', 'night_h', 'sunday_h', 'holiday_h', 'note']];
    for (const d of s.days) {
      if (!d.entry) continue;
      rows.push([d.date, t.weekdaysShort[weekdayIndex(d.date)], d.code, d.type?.name ?? '', fmtSegments(d.segments), String(d.breakMin), (d.workedMin / 60).toFixed(2), (d.nightMin / 60).toFixed(2), (d.sundayMin / 60).toFixed(2), (d.holidayMin / 60).toFixed(2), d.entry.note ?? '']);
    }
    const csv = rows.map((r) => r.map((c) => (/[",;\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(';')).join('\n');
    await saveFile(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `ore-${start}_${end}.csv`, { share: true });
    toast(t.toast.exported);
  };

  const exportIcs = async () => {
    const ics = buildIcs(s.days, (d) => (d.type ? `${d.type.code} · ${d.type.name}` : d.code));
    await saveFile(new Blob([ics], { type: 'text/calendar' }), `turni-${start}_${end}.ics`, { share: true });
  };

  return (
    <div>
      <PageHeader
        title={title}
        eyebrow={t.hours.title}
        actions={mode !== 'range' && (
          <>
            <IconButton label={t.common.back} variant="secondary" onClick={() => step(-1)}><ChevronLeft className="size-5" /></IconButton>
            <IconButton label={t.common.next} variant="secondary" onClick={() => step(1)}><ChevronRight className="size-5" /></IconButton>
          </>
        )}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          size="sm"
          value={mode}
          onChange={setMode}
          className="w-full sm:w-auto"
          options={[
            { value: 'month', label: t.common.month },
            { value: 'pay', label: t.hours.payPeriod },
            { value: 'week', label: t.common.week },
            { value: 'range', label: t.hours.range },
          ]}
        />
        {mode === 'range' && (
          <div className="flex w-full gap-2 sm:w-auto">
            <Input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className="h-10" />
            <Input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className="h-10" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr_1fr]">
        <Card className="hero-gradient relative overflow-hidden p-5 text-white ring-0 sm:p-6">
          <div className="text-[13px] font-semibold text-white/60">{t.hours.worked}</div>
          <div className="tabular mt-1 text-[44px] font-bold leading-none tracking-[-0.04em]">
            {f.minutes(s.workedMin + s.creditedMin, { zero: '0' })}
            <span className="ml-1.5 text-[18px] font-semibold text-white/50">{t.common.h}</span>
          </div>
          <div className="mt-2 text-[14px] text-white/65">
            {t.common.days(s.daysWorked)}{s.creditedMin ? ` · ${t.hours.credited} ${f.minutes(s.creditedMin)}` : ''}
          </div>
          {s.targetMin > 0 && (
            <div className="mt-5">
              <div className="flex justify-between text-[12.5px] font-medium text-white/60">
                <span>{t.hours.target} {f.minutes(s.targetMin)}</span>
                <span className={cn('tabular font-semibold', s.balanceMin >= 0 ? 'text-emerald-300' : 'text-rose-300')}>{s.balanceMin >= 0 ? '+' : ''}{f.minutes(s.balanceMin)}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/12">
                <div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, ((s.workedMin + s.creditedMin) / s.targetMin) * 100)}%` }} />
              </div>
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <Button size="sm" variant="primary" icon={<FileDown className="size-4" />} onClick={() => setReportOpen(true)}>{t.hours.pdf}</Button>
            <Button size="sm" className="bg-white/10 text-white ring-white/20 hover:bg-white/15" icon={<FileSpreadsheet className="size-4" />} onClick={exportCsv}>CSV</Button>
            <Button size="sm" className="bg-white/10 text-white ring-white/20 hover:bg-white/15" icon={<CalendarPlus className="size-4" />} onClick={exportIcs}>.ics</Button>
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-3">
          <Stat label={t.hours.night} value={f.minutes(s.nightMin, { zero: '0' })} icon={<Moon className="size-3.5" />} accent="bg-indigo-500/12 text-indigo-500" />
          <Stat label={t.hours.sunday} value={f.minutes(s.sundayMin, { zero: '0' })} icon={<Sun className="size-3.5" />} accent="bg-amber-500/12 text-amber-500" />
          <Stat label={t.hours.holiday} value={f.minutes(s.holidayMin, { zero: '0' })} icon={<TrendingUp className="size-3.5" />} accent="bg-rose-500/12 text-rose-500" />
          {pay.supplements.overtimeRule !== 'none' ? (
            <Stat label={t.hours.overtime} value={f.minutes(s.overtimeMin, { zero: '0' })} icon={<Timer className="size-3.5" />} accent="bg-orange-500/12 text-orange-500" />
          ) : s.targetMin ? (
            <Stat label={t.hours.balance} value={`${s.balanceMin >= 0 ? '+' : ''}${f.minutes(s.balanceMin)}`} icon={<Scale className="size-3.5" />} accent="bg-sky-500/12 text-sky-500" />
          ) : (
            <Stat label={t.hours.breaks} value={f.minutes(s.breakMin, { zero: '0' })} icon={<Timer className="size-3.5" />} />
          )}
          <Stat className="col-span-2" label={t.hours.absences} value={absences ? `${s.kindCounts.vacation} ${t.kinds.vacation.toLowerCase()} · ${s.kindCounts.sick} ${t.kinds.sick.toLowerCase()}` : '0'} icon={<Plane className="size-3.5" />} accent="bg-emerald-500/12 text-emerald-500" />
        </div>
      </div>

      {s.unknownCodes.length > 0 && (
        <button onClick={() => navigate('/types', { code: s.unknownCodes[0] })} className="mt-3 flex w-full items-center gap-3 rounded-2xl bg-warning/10 p-3.5 text-left text-[14px] ring-1 ring-warning/25">
          <AlertTriangle className="size-5 shrink-0 text-warning" />
          <span className="flex-1 text-ink-2">{t.hours.unknown(s.days.filter((d) => d.unknown).length)} ({s.unknownCodes.join(', ')})</span>
        </button>
      )}

      {s.plannedDays === 0 ? (
        <Card className="mt-4"><EmptyState icon={<Timer className="size-6" />} title={t.hours.noData} /></Card>
      ) : (
        <>
          <SectionTitle>{t.hours.perDay}</SectionTitle>
          <Card className="p-3 pt-5 sm:p-5">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -22, bottom: 0 }} barCategoryGap={2}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} interval={chartData.length > 16 ? 2 : 0} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} width={44} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: 'var(--surface-3)', opacity: 0.6 }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as (typeof chartData)[number];
                      return (
                        <div className="rounded-xl bg-surface px-3 py-2 text-[12.5px] shadow-float ring-1 ring-line">
                          <div className="font-semibold text-ink">{f.dateCap(p.date, 'EEE d MMM')}</div>
                          <div className="tabular text-muted">{p.code ? `${p.code} · ` : ''}{f.hours(p.hours, { zero: '0' })} {t.common.h}</div>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="hours" fill="var(--brand)" radius={[4, 4, 0, 0]} maxBarSize={22} animationDuration={450} onClick={(d) => openDay((d as unknown as { date: string }).date)} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <SectionTitle>{t.hours.byDay}</SectionTitle>
          <Card className="overflow-hidden">
            <div className="divide-y divide-line">
              {s.days.filter((d) => d.entry).map((d) => (
                <button key={d.date} onClick={() => openDay(d.date)} className="grid w-full grid-cols-[72px_auto_1fr_auto] items-center gap-3 px-4 py-2.5 text-left transition hover:bg-surface-2 sm:grid-cols-[96px_auto_1fr_70px_70px]">
                  <span className={cn('text-[13.5px] font-semibold', d.holiday || weekdayIndex(d.date) === 6 ? 'text-danger' : 'text-ink')}>{f.dateCap(d.date, 'EEE d')}</span>
                  <ShiftChip code={d.code} type={d.type} kind={d.kind} unknown={d.unknown} />
                  <span className="tabular truncate text-[13px] text-muted">{d.segments.length && (d.kind === 'work' || d.kind === 'training') ? fmtSegments(d.segments) : d.type?.name ?? t.kinds[d.kind === 'none' ? 'other' : d.kind]}</span>
                  <span className="tabular hidden text-right text-[12.5px] text-muted sm:block">{d.nightMin ? `☾ ${f.minutes(d.nightMin)}` : ''}</span>
                  <span className="tabular text-right text-[14px] font-semibold text-ink">{d.workedMin ? f.minutes(d.workedMin) : d.creditedMin ? f.minutes(d.creditedMin) : '–'}</span>
                </button>
              ))}
            </div>
          </Card>
        </>
      )}

      {reportOpen && <ReportSheet open={reportOpen} onClose={() => setReportOpen(false)} start={start} end={end} types={types} profileLocale={profile.locale} />}
    </div>
  );
}

function ReportSheet({ open, onClose, start, end, profileLocale, types }: { open: boolean; onClose: () => void; start: ISODate; end: ISODate; profileLocale: Locale; types: ReturnType<typeof useStore.getState>['types'] }) {
  const t = useT();
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const summary = useSummary(start, end);
  const [locale, setLocale] = useState<Locale>(profileLocale);
  const [includeRest, setIncludeRest] = useState(false);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [includeSignatures, setIncludeSignatures] = useState(true);
  const [includeLegend, setIncludeLegend] = useState(true);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const build = async () => {
    const { buildHoursReport, reportFileName } = await import('@/report/pdf');
    const doc = buildHoursReport(summary, profile, types, { locale, includeRest, includeNotes, includeSignatures, includeLegend, hoursFormat: profile.hoursFormat });
    return { blob: doc.output('blob'), name: reportFileName(summary, profile) };
  };

  const generate = async (share: boolean) => {
    setBusy(true);
    try {
      const { blob, name } = await build();
      await saveFile(blob, name, { share, title: t.report.docTitle });
      toast(t.report.generated);
    } catch {
      toast(t.common.error, 'error');
    } finally {
      setBusy(false);
    }
  };

  const preview = async () => {
    setBusy(true);
    try {
      const { blob } = await build();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={() => { if (previewUrl) URL.revokeObjectURL(previewUrl); onClose(); }}
      title={t.hours.pdf}
      subtitle={t.report.noAmounts}
      size={previewUrl ? 'xl' : 'md'}
      closeLabel={t.common.close}
      footer={
        <div className="flex gap-2">
          <Button onClick={preview} loading={busy && !previewUrl}>{t.common.preview}</Button>
          <Button variant="primary" block loading={busy} icon={<FileDown className="size-4.5" />} onClick={() => generate(true)}>{t.report.generate}</Button>
        </div>
      }
    >
      <div className={cn('grid grid-cols-1 gap-5', previewUrl && 'lg:grid-cols-[320px_1fr]')}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.report.employee}><Input value={profile.name} onChange={(e) => setProfile({ name: e.target.value })} /></Field>
            <Field label={t.report.employeeId}><Input value={profile.employeeId} onChange={(e) => setProfile({ employeeId: e.target.value })} /></Field>
            <Field label={t.report.employer}><Input value={profile.employer} onChange={(e) => setProfile({ employer: e.target.value })} /></Field>
            <Field label={t.report.department}><Input value={profile.department} onChange={(e) => setProfile({ department: e.target.value })} /></Field>
          </div>
          <Field label={t.report.language}>
            <Select value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
              {(Object.keys(LOCALE_NAMES) as Locale[]).map((l) => <option key={l} value={l}>{LOCALE_NAMES[l]}</option>)}
            </Select>
          </Field>
          <div className="space-y-3.5 rounded-2xl bg-surface-2 p-4 ring-1 ring-line">
            <Switch checked={includeRest} onChange={setIncludeRest} label={t.report.includeRest} />
            <Switch checked={includeNotes} onChange={setIncludeNotes} label={t.report.includeNotes} />
            <Switch checked={includeLegend} onChange={setIncludeLegend} label={t.report.includeLegend} />
            <Switch checked={includeSignatures} onChange={setIncludeSignatures} label={t.report.includeSignatures} />
          </div>
        </div>
        {previewUrl && <iframe title={t.common.preview} src={previewUrl} className="h-[60vh] w-full rounded-2xl bg-white ring-1 ring-line" />}
      </div>
    </Sheet>
  );
}
