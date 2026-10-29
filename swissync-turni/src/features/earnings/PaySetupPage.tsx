import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Check, Plus, X } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Input, NumberInput, Segmented, Select, Switch, TimeInput } from '@/components/ui/Form';
import { toast } from '@/components/ui/Feedback';
import { goBack, navigate } from '@/app/router';
import { useSummary, useToday } from '@/app/hooks';
import { payPeriodFor } from '@/engine/dates';
import type { PeriodSummary } from '@/engine/hours';
import { calculatePay } from '@/engine/pay';
import { payPreset, type PayPresetId } from '@/engine/presets';
import type { PayDeduction, PayExtra, PayProfile } from '@/engine/types';
import { uid } from '@/lib/id';
import { useStore } from '@/store/store';
import { useT } from '@/i18n';
import { useFmt } from '@/lib/format';
import { cn } from '@/lib/cn';

const CURRENCIES = ['CHF', 'EUR', 'USD', 'GBP'];

export function PaySetupPage() {
  const t = useT();
  const f = useFmt();
  const today = useToday();
  const stored = useStore((s) => s.pay);
  const profile = useStore((s) => s.profile);
  const setPay = useStore((s) => s.setPay);
  const setProfile = useStore((s) => s.setProfile);
  const [step, setStep] = useState(stored.configured ? 1 : 0);
  const [p, setP] = useState<PayProfile>(stored);
  const [weeklyHours, setWeeklyHours] = useState(profile.weeklyHours);
  const steps = t.wizard.steps;

  const period = payPeriodFor(today, p.periodStartDay);
  const current = useSummary(period.start, period.end);
  const example = useMemo<PeriodSummary>(() => (current.workedMin > 60 * 20 ? current : { ...current, workedMin: 160 * 60, creditedMin: 0, nightMin: 8 * 60, sundayMin: 16 * 60, saturdayMin: 0, holidayMin: 0, overtimeMin: 0 }), [current]);
  const preview = calculatePay(example, p, weeklyHours);

  const set = (patch: Partial<PayProfile>) => setP((x) => ({ ...x, ...patch }));
  const setSup = (patch: Partial<PayProfile['supplements']>) => setP((x) => ({ ...x, supplements: { ...x.supplements, ...patch } }));
  const setAl = (patch: Partial<PayProfile['allowances']>) => setP((x) => ({ ...x, allowances: { ...x.allowances, ...patch } }));

  const choosePreset = (id: PayPresetId) => {
    setP({ ...payPreset(id, profile.locale), payday: p.payday || 25 });
    if (!weeklyHours) setWeeklyHours(id === 'it-monthly' ? 40 : 42);
    setStep(1);
  };

  const finish = () => {
    setPay({ ...p, configured: true, source: p.source === 'example' ? 'wizard' : p.source });
    setProfile({ weeklyHours });
    toast(t.wizard.saved);
    navigate('/earnings');
  };

  const percent = (value: number, onChange: (v: number) => void, label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <NumberInput value={value} onChange={onChange} suffix="%" min={0} />
    </Field>
  );

  const content = [
    // 0 — preset
    <div key="preset" className="space-y-3">
      <h2 className="text-[22px] font-bold tracking-[-0.02em] text-ink">{t.wizard.presetTitle}</h2>
      <p className="text-[14px] text-muted">{t.wizard.presetHint}</p>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {(['ch-hourly', 'ch-monthly', 'it-monthly', 'generic'] as PayPresetId[]).map((id) => (
          <button key={id} onClick={() => choosePreset(id)} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-4 text-left ring-1 ring-line transition hover:bg-surface-3 hover:ring-line-strong">
            <span className="text-[24px]">{id.startsWith('ch') ? '🇨🇭' : id.startsWith('it') ? '🇮🇹' : '🌍'}</span>
            <span className="text-[15px] font-semibold text-ink">{t.wizard.presets[id]}</span>
          </button>
        ))}
      </div>
    </div>,

    // 1 — salary
    <div key="salary" className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.wizard.currency}>
          <Select value={p.currency} onChange={(e) => set({ currency: e.target.value, rounding: e.target.value === 'CHF' ? 0.05 : 0.01 })}>
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label={t.wizard.rounding}>
          <Select value={String(p.rounding)} onChange={(e) => set({ rounding: Number(e.target.value) })}>
            <option value="0.05">{t.wizard.rounding05}</option>
            <option value="0.01">{t.wizard.rounding01}</option>
          </Select>
        </Field>
      </div>
      <Field label={t.wizard.mode}>
        <Segmented value={p.mode} onChange={(v) => set({ mode: v })} options={[{ value: 'hourly', label: t.wizard.hourly }, { value: 'monthly', label: t.wizard.monthly }]} />
      </Field>
      {p.mode === 'hourly' ? (
        <Field label={t.wizard.hourlyRate}>
          <NumberInput value={p.hourlyRate} onChange={(v) => set({ hourlyRate: v })} suffix={`${p.currency}/h`} min={0} />
        </Field>
      ) : (
        <Field label={t.wizard.monthlySalary}>
          <NumberInput value={p.monthlySalary} onChange={(v) => set({ monthlySalary: v })} suffix={p.currency} min={0} />
        </Field>
      )}
      <Field label={t.wizard.weeklyHours} hint={t.wizard.weeklyHoursHint}>
        <NumberInput value={weeklyHours} onChange={setWeeklyHours} suffix={t.common.h} min={0} />
      </Field>
    </div>,

    // 2 — supplements
    <div key="sup" className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {percent(p.supplements.nightPct, (v) => setSup({ nightPct: v }), t.wizard.night)}
        <Field label={t.wizard.nightWindow}>
          <div className="flex items-center gap-1.5">
            <TimeInput value={p.supplements.nightStart} onChange={(v) => setSup({ nightStart: v })} />
            <span className="text-muted">–</span>
            <TimeInput value={p.supplements.nightEnd} onChange={(v) => setSup({ nightEnd: v })} />
          </div>
        </Field>
        {percent(p.supplements.sundayPct, (v) => setSup({ sundayPct: v }), t.wizard.sunday)}
        {percent(p.supplements.saturdayPct, (v) => setSup({ saturdayPct: v }), t.wizard.saturday)}
        {percent(p.supplements.holidayPct, (v) => setSup({ holidayPct: v }), t.wizard.holidayWork)}
      </div>
      <Card className="space-y-3 p-4">
        <Field label={t.wizard.overtimeRule}>
          <Select value={p.supplements.overtimeRule} onChange={(e) => setSup({ overtimeRule: e.target.value as PayProfile['supplements']['overtimeRule'] })}>
            <option value="none">{t.wizard.overtimeNone}</option>
            <option value="weekly">{t.wizard.overtimeWeekly}</option>
            <option value="daily">{t.wizard.overtimeDaily}</option>
          </Select>
        </Field>
        {p.supplements.overtimeRule !== 'none' && (
          <div className="grid grid-cols-2 gap-3">
            {percent(p.supplements.overtimePct, (v) => setSup({ overtimePct: v }), t.wizard.overtimePct)}
            {p.supplements.overtimeRule === 'daily' && (
              <Field label={t.wizard.overtimeDailyHours}>
                <NumberInput value={p.supplements.overtimeDailyHours} onChange={(v) => setSup({ overtimeDailyHours: v })} suffix={t.common.h} min={0} />
              </Field>
            )}
          </div>
        )}
      </Card>
    </div>,

    // 3 — allowances
    <div key="al" className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {percent(p.allowances.vacationPct, (v) => setAl({ vacationPct: v }), t.wizard.vacation)}
        {percent(p.allowances.holidayPct, (v) => setAl({ holidayPct: v }), t.wizard.holidays)}
        {percent(p.allowances.thirteenthPct, (v) => setAl({ thirteenthPct: v }), t.wizard.thirteenth)}
        <Field label={t.wizard.thirteenthOn}>
          <Select value={p.allowances.thirteenthOn} onChange={(e) => setAl({ thirteenthOn: e.target.value as PayProfile['allowances']['thirteenthOn'] })}>
            <option value="base">{t.wizard.thirteenthBase}</option>
            <option value="base-allowances">{t.wizard.thirteenthBaseAllowances}</option>
          </Select>
        </Field>
      </div>
      <p className="px-0.5 text-[12.5px] text-muted">{t.wizard.vacationHint}</p>
      <Field label={t.wizard.extras}>
        <div className="space-y-2">
          {p.extras.map((ex) => (
            <ExtraRow key={ex.id} ex={ex} currency={p.currency} onChange={(n) => set({ extras: p.extras.map((x) => (x.id === ex.id ? n : x)) })} onRemove={() => set({ extras: p.extras.filter((x) => x.id !== ex.id) })} />
          ))}
          <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => set({ extras: [...p.extras, { id: uid(), label: '', type: 'per-hour', amount: 0, maxHours: 0, social: false }] })}>{t.wizard.addExtra}</Button>
        </div>
      </Field>
    </div>,

    // 4 — deductions
    <div key="ded" className="space-y-3">
      <p className="text-[13.5px] text-muted">{t.wizard.deductionsHint}</p>
      {p.deductions.map((d) => (
        <DeductionRow key={d.id} d={d} onChange={(n) => set({ deductions: p.deductions.map((x) => (x.id === d.id ? n : x)) })} onRemove={() => set({ deductions: p.deductions.filter((x) => x.id !== d.id) })} />
      ))}
      <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => set({ deductions: [...p.deductions, { id: uid(), label: '', pct: 0, base: 'social', baseFactor: 1, fixed: 0 }] })}>{t.wizard.addDeduction}</Button>
    </div>,

    // 5 — payment
    <div key="pay" className="space-y-4">
      <Field label={t.wizard.periodStart} hint={t.wizard.periodStartHint}>
        <NumberInput value={p.periodStartDay} onChange={(v) => set({ periodStartDay: Math.min(28, Math.max(1, Math.round(v) || 1)) })} min={1} />
      </Field>
      <Field label={t.wizard.payday}>
        <NumberInput value={p.payday} onChange={(v) => set({ payday: Math.min(31, Math.max(1, Math.round(v) || 1)) })} min={1} />
      </Field>
      <Switch checked={p.paidNextMonth} onChange={(v) => set({ paidNextMonth: v })} label={t.wizard.paidNextMonth} />
    </div>,
  ];

  const last = step === content.length - 1;
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-5 flex items-center gap-3 px-1 pt-2">
        <IconButton label={t.common.back} variant="secondary" onClick={() => (step > 0 ? setStep(step - 1) : goBack('/earnings'))}><ArrowLeft className="size-5" /></IconButton>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-muted">{t.wizard.title}</div>
          <h1 className="truncate text-[24px] font-bold tracking-[-0.03em] text-ink">{steps[step]}</h1>
        </div>
      </header>

      <div className="mb-5 flex gap-1.5 px-1">
        {steps.map((label, i) => (
          <button key={label} onClick={() => (i > 0 || !stored.configured) && setStep(i)} className="group flex-1" aria-label={label}>
            <div className={cn('h-1.5 rounded-full transition', i <= step ? 'bg-brand' : 'bg-line-strong')} />
            <div className={cn('mt-1.5 hidden truncate text-[11.5px] font-medium sm:block', i === step ? 'text-ink' : 'text-muted')}>{label}</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
        <Card className="p-5 sm:p-6">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }}>
              {content[step]}
            </motion.div>
          </AnimatePresence>
          {step > 0 && (
            <div className="mt-6 flex gap-2">
              {last ? (
                <Button variant="primary" block icon={<Check className="size-4.5" />} onClick={finish}>{t.common.save}</Button>
              ) : (
                <Button variant="primary" block onClick={() => setStep(step + 1)}>{t.common.next}</Button>
              )}
            </div>
          )}
        </Card>

        {step > 0 && (
          <Card className="h-fit p-5 lg:sticky lg:top-8">
            <div className="text-[12.5px] font-semibold uppercase tracking-wide text-muted">{example === current ? t.today.thisMonth : t.wizard.example}</div>
            <div className="mt-3 space-y-2 text-[14px]">
              <Row label={t.earnings.paidHours} value={`${f.hours(preview.paidHours)} ${t.common.h}`} />
              <Row label={t.earnings.gross} value={f.money(preview.gross, { currency: p.currency })} />
              <Row label={t.earnings.deductions} value={`− ${f.money(preview.totalDeductions, { currency: p.currency })}`} />
            </div>
            <div className="mt-3 border-t border-line pt-3">
              <div className="text-[12.5px] font-medium text-muted">{t.earnings.net}</div>
              <div className="tabular text-[26px] font-bold tracking-[-0.03em] text-ink">{f.money(preview.net, { currency: p.currency })}</div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="tabular font-semibold text-ink">{value}</span>
    </div>
  );
}

function ExtraRow({ ex, currency, onChange, onRemove }: { ex: PayExtra; currency: string; onChange: (e: PayExtra) => void; onRemove: () => void }) {
  const t = useT();
  return (
    <div className="space-y-2 rounded-2xl bg-surface-2 p-3 ring-1 ring-line">
      <div className="flex gap-2">
        <Input value={ex.label} onChange={(e) => onChange({ ...ex, label: e.target.value })} placeholder={t.wizard.label} />
        <IconButton label={t.common.delete} onClick={onRemove}><X className="size-4" /></IconButton>
      </div>
      <div className="grid grid-cols-[1.2fr_1fr] gap-2">
        <Select value={ex.type} onChange={(e) => onChange({ ...ex, type: e.target.value as PayExtra['type'] })}>
          <option value="per-hour">{t.wizard.extraPerHour}</option>
          <option value="fixed">{t.wizard.extraFixed}</option>
          <option value="percent-base">{t.wizard.extraPercent}</option>
        </Select>
        <NumberInput value={ex.amount} onChange={(v) => onChange({ ...ex, amount: v })} suffix={ex.type === 'percent-base' ? '%' : currency} min={0} />
      </div>
      {ex.type === 'per-hour' && (
        <NumberInput value={ex.maxHours} onChange={(v) => onChange({ ...ex, maxHours: v })} suffix={t.wizard.extraMaxHours} min={0} />
      )}
      <Switch checked={ex.social} onChange={(v) => onChange({ ...ex, social: v })} label={t.wizard.extraSocial} />
    </div>
  );
}

function DeductionRow({ d, onChange, onRemove }: { d: PayDeduction; onChange: (d: PayDeduction) => void; onRemove: () => void }) {
  const t = useT();
  return (
    <div className="space-y-2 rounded-2xl bg-surface-2 p-3 ring-1 ring-line">
      <div className="flex gap-2">
        <Input value={d.label} onChange={(e) => onChange({ ...d, label: e.target.value })} placeholder={t.wizard.label} />
        <div className="w-28 shrink-0"><NumberInput value={d.pct} onChange={(v) => onChange({ ...d, pct: v })} suffix="%" min={0} /></div>
        <IconButton label={t.common.delete} onClick={onRemove}><X className="size-4" /></IconButton>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select value={d.base} onChange={(e) => onChange({ ...d, base: e.target.value as PayDeduction['base'] })} aria-label={t.wizard.deductionBase}>
          <option value="social">{t.wizard.baseSocial}</option>
          <option value="base">{t.wizard.baseBase}</option>
          <option value="gross">{t.wizard.baseGross}</option>
        </Select>
        <Select value={String(d.baseFactor)} onChange={(e) => onChange({ ...d, baseFactor: Number(e.target.value) })} aria-label={t.wizard.baseFactor}>
          {[...new Set([1, 0.75, 0.5, 0.25, d.baseFactor])].sort((a, b) => b - a).map((v) => <option key={v} value={v}>{t.wizard.baseFactor} {Math.round(v * 100)}%</option>)}
        </Select>
      </div>
    </div>
  );
}
