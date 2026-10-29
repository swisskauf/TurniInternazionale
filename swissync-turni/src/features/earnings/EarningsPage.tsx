import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, FileSearch, Info, ListChecks, Settings2, Sparkles, Trash2, Wallet } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, PageHeader, SectionTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Feedback';
import { navigate } from '@/app/router';
import { useCalcOptions, useToday } from '@/app/hooks';
import { makeISO, payPeriodByLabel, payPeriodFor, shiftMonthLabel } from '@/engine/dates';
import { summarize } from '@/engine/hours';
import { calculatePay, type PayLine } from '@/engine/pay';
import { useStore } from '@/store/store';
import { useT } from '@/i18n';
import { useFmt } from '@/lib/format';
import { cn } from '@/lib/cn';
import { PayslipSheet } from './PayslipSheet';

export function EarningsPage() {
  const t = useT();
  const f = useFmt();
  const today = useToday();
  const pay = useStore((s) => s.pay);
  const profile = useStore((s) => s.profile);
  const entries = useStore((s) => s.entries);
  const types = useStore((s) => s.types);
  const payslips = useStore((s) => s.payslips);
  const removePayslip = useStore((s) => s.removePayslip);
  const opts = useCalcOptions();
  const [label, setLabel] = useState(() => payPeriodFor(today, pay.periodStartDay).label);
  const [sheet, setSheet] = useState<null | 'setup' | 'compare'>(null);

  const period = payPeriodByLabel(label, pay.periodStartDay);
  const summary = useMemo(() => summarize(period.start, period.end, entries, types, opts), [period.start, period.end, entries, types, opts]);
  const result = pay.configured ? calculatePay(summary, pay, profile.weeklyHours) : null;
  const actual = payslips.find((p) => p.period === label);

  const history = useMemo(() => {
    if (!pay.configured) return [];
    return Array.from({ length: 6 }, (_, i) => {
      const l = shiftMonthLabel(label, i - 5);
      const p = payPeriodByLabel(l, pay.periodStartDay);
      const s = summarize(p.start, p.end, entries, types, opts);
      const r = calculatePay(s, pay, profile.weeklyHours);
      return { label: l, net: s.workedMin ? r.net : 0, deductions: s.workedMin ? r.totalDeductions : 0, hours: s.workedMin / 60, current: l === label };
    });
  }, [label, pay, entries, types, opts, profile.weeklyHours]);

  const paydayISO = useMemo(() => {
    const [y, m] = label.split('-').map(Number);
    const d = new Date(y, (pay.paidNextMonth ? m : m - 1), 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return makeISO(d.getFullYear(), d.getMonth() + 1, Math.min(pay.payday || 25, last))!;
  }, [label, pay.paidNextMonth, pay.payday]);

  if (!pay.configured) {
    return (
      <div>
        <PageHeader title={t.earnings.title} />
        <Card className="hero-gradient overflow-hidden p-6 text-white ring-0 sm:p-8">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15"><Wallet className="size-7" /></span>
          <h2 className="mt-5 text-[26px] font-bold leading-tight tracking-[-0.03em]">{t.earnings.setupTitle}</h2>
          <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-white/70">{t.earnings.setupText}</p>
        </Card>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button onClick={() => navigate('/pay-setup')} className="flex items-start gap-4 rounded-[22px] bg-surface p-5 text-left shadow-card ring-1 ring-line transition hover:-translate-y-0.5 hover:ring-line-strong">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-500"><ListChecks className="size-6" /></span>
            <span>
              <span className="block text-[17px] font-semibold text-ink">{t.earnings.wizard}</span>
              <span className="mt-1 block text-[14px] leading-snug text-muted">{t.earnings.wizardHint}</span>
            </span>
          </button>
          <button onClick={() => setSheet('setup')} className="flex items-start gap-4 rounded-[22px] bg-surface p-5 text-left shadow-card ring-1 ring-line transition hover:-translate-y-0.5 hover:ring-line-strong">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-violet-500/12 text-violet-500"><Sparkles className="size-6" /></span>
            <span>
              <span className="block text-[17px] font-semibold text-ink">{t.earnings.payslip}</span>
              <span className="mt-1 block text-[14px] leading-snug text-muted">{t.earnings.payslipHint}</span>
            </span>
          </button>
        </div>
        {sheet && <PayslipSheet open={!!sheet} mode={sheet} onClose={() => setSheet(null)} />}
      </div>
    );
  }

  const r = result!;
  const lineLabel = (l: PayLine) => l.label ?? t.earnings.lines[l.key] ?? l.key;
  const lineDetail = (l: PayLine) => {
    if (l.key === 'base' && l.hours != null && l.rate) return `${f.hours(l.hours)} h × ${f.number(l.rate)}`;
    if (l.hours != null && l.rate && l.pct) return `${f.hours(l.hours)} h × ${f.number(l.rate)} × ${l.pct}%`;
    if (l.hours != null && l.rate) return `${f.hours(l.hours)} h × ${f.number(l.rate)}`;
    if (l.pct != null && l.base != null) return `${l.pct}% × ${f.money(l.base)}`;
    return '';
  };
  const diff = actual ? Math.round((actual.net - r.net) * 100) / 100 : 0;

  return (
    <div>
      <PageHeader
        title={f.dateCap(`${label}-01`, 'LLLL yyyy')}
        eyebrow={t.earnings.title}
        actions={
          <>
            <IconButton label={t.common.back} variant="secondary" onClick={() => setLabel(shiftMonthLabel(label, -1))}><ChevronLeft className="size-5" /></IconButton>
            <IconButton label={t.common.next} variant="secondary" onClick={() => setLabel(shiftMonthLabel(label, 1))}><ChevronRight className="size-5" /></IconButton>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.25fr_1fr]">
        <Card className="hero-gradient relative overflow-hidden p-5 text-white ring-0 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[13px] font-semibold text-white/60">{t.earnings.net}</div>
            {pay.periodStartDay > 1 && <span className="text-[12.5px] text-white/55">{f.date(period.start, 'd MMM')} – {f.date(period.end, 'd MMM')}</span>}
          </div>
          <div className="tabular mt-1 text-[42px] font-bold leading-none tracking-[-0.04em]">{f.money(r.net)}</div>
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 sm:grid-cols-3">
            <div>
              <div className="text-[12px] text-white/55">{t.earnings.gross}</div>
              <div className="tabular whitespace-nowrap text-[15px] font-semibold">{f.money(r.gross)}</div>
            </div>
            <div>
              <div className="text-[12px] text-white/55">{t.earnings.deductions}</div>
              <div className="tabular whitespace-nowrap text-[15px] font-semibold">−{f.money(r.totalDeductions)}</div>
            </div>
            <div>
              <div className="text-[12px] text-white/55">{t.earnings.paidHours}</div>
              <div className="tabular whitespace-nowrap text-[15px] font-semibold">{f.hours(r.paidHours)} {t.common.h}</div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-[13px] text-white/65"><CalendarClock className="size-4" /> {t.earnings.payday(f.date(paydayISO, 'EEEE d MMMM'))}</div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="mb-2 text-[13px] font-semibold text-muted">{t.earnings.history}</div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={history} margin={{ top: 4, right: 0, left: -12, bottom: 0 }} barCategoryGap="28%">
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={(l: string) => f.date(`${l}-01`, 'MMM')} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} width={48} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v))} />
                <Tooltip
                  cursor={{ fill: 'var(--surface-3)', opacity: 0.6 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as (typeof history)[number];
                    return (
                      <div className="rounded-xl bg-surface px-3 py-2 text-[12.5px] shadow-float ring-1 ring-line">
                        <div className="font-semibold text-ink">{f.dateCap(`${p.label}-01`, 'LLLL yyyy')}</div>
                        <div className="tabular text-muted">{t.earnings.net}: {f.money(p.net)}</div>
                        <div className="tabular text-muted">{t.earnings.deductions}: {f.money(p.deductions)}</div>
                        <div className="tabular text-muted">{f.hours(p.hours)} {t.common.h}</div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="net" stackId="a" fill="var(--brand)" radius={[0, 0, 0, 0]} maxBarSize={30} animationDuration={450} onClick={(d) => setLabel((d as unknown as { label: string }).label)} />
                <Bar dataKey="deductions" stackId="a" fill="var(--faint)" radius={[4, 4, 0, 0]} maxBarSize={30} animationDuration={450} onClick={(d) => setLabel((d as unknown as { label: string }).label)} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex gap-4 text-[12px] text-muted">
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-brand" />{t.earnings.net}</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-faint" />{t.earnings.deductions}</span>
          </div>
        </Card>
      </div>

      {/* Payslip comparison */}
      <Card className={cn('mt-4 p-4 sm:p-5', actual && Math.abs(diff) < 1 && 'ring-success/30')}>
        {actual ? (
          <div className="flex items-center gap-4">
            <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-2xl', Math.abs(diff) < 1 ? 'bg-success/12 text-success' : 'bg-warning/12 text-warning')}>
              {Math.abs(diff) < 1 ? <CheckCircle2 className="size-5" /> : <FileSearch className="size-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold text-ink">{Math.abs(diff) < 1 ? t.earnings.matches : `${t.earnings.difference}: ${f.money(diff, { sign: true })}`}</div>
              <div className="tabular text-[13px] text-muted">{t.earnings.actual}: {f.money(actual.net)} · {t.earnings.estimated}: {f.money(r.net)}{actual.hoursPaid ? ` · ${f.hours(actual.hoursPaid)} h` : ''}</div>
            </div>
            <IconButton label={t.common.delete} onClick={() => removePayslip(actual.id)}><Trash2 className="size-4.5 text-muted" /></IconButton>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/12 text-violet-500"><FileSearch className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold text-ink">{t.earnings.compare}</div>
                <div className="text-[13px] leading-snug text-muted">{t.earnings.compareHint}</div>
              </div>
            </div>
            <Button size="sm" variant="soft" icon={<Sparkles className="size-4" />} onClick={() => setSheet('compare')}>{t.earnings.payslip}</Button>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <SectionTitle>{t.earnings.earningsTitle}</SectionTitle>
          <Card className="divide-y divide-line overflow-hidden">
            {r.earnings.map((l, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14.5px] font-medium text-ink">{lineLabel(l)}</div>
                  {lineDetail(l) && <div className="tabular truncate text-[12.5px] text-muted">{lineDetail(l)}</div>}
                </div>
                {!l.social && <Badge>{t.wizard.extras}</Badge>}
                <span className="tabular text-[15px] font-semibold text-ink">{f.money(l.amount)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between bg-surface-2 px-4 py-3">
              <span className="text-[14.5px] font-semibold text-ink">{t.earnings.gross}</span>
              <span className="tabular text-[16px] font-bold text-ink">{f.money(r.gross)}</span>
            </div>
          </Card>
        </div>
        <div>
          <SectionTitle>{t.earnings.deductionsTitle}</SectionTitle>
          <Card className="divide-y divide-line overflow-hidden">
            {r.deductions.length === 0 && <div className="px-4 py-4 text-[14px] text-muted">—</div>}
            {r.deductions.map((l, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14.5px] font-medium text-ink">{lineLabel(l)}</div>
                  <div className="tabular truncate text-[12.5px] text-muted">{lineDetail(l)}</div>
                </div>
                <span className="tabular text-[15px] font-semibold text-danger">− {f.money(l.amount)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between bg-surface-2 px-4 py-3">
              <span className="text-[14.5px] font-semibold text-ink">{t.earnings.net}</span>
              <span className="tabular text-[16px] font-bold text-brand">{f.money(r.net)}</span>
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button icon={<Settings2 className="size-4.5" />} onClick={() => navigate('/pay-setup')}>{t.earnings.editProfile}</Button>
        <Button variant="ghost" icon={<Sparkles className="size-4.5" />} onClick={() => setSheet('setup')}>{t.earnings.payslip}</Button>
      </div>
      <p className="mt-4 flex items-start gap-2 px-1 text-[12.5px] leading-relaxed text-muted"><Info className="mt-0.5 size-3.5 shrink-0" />{t.earnings.disclaimer}</p>

      {sheet && <PayslipSheet open={!!sheet} mode={sheet} onClose={() => setSheet(null)} />}
    </div>
  );
}
