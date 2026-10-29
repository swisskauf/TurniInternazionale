import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Camera, CheckCircle2, Cloud, FileSpreadsheet, FileText, PenLine } from 'lucide-react';
import { useAccountsAvailable } from '@/cloud/account';
import { Button } from '@/components/ui/Button';
import { Field, Input, NumberInput, Select } from '@/components/ui/Form';
import { Logo } from '@/components/ShiftChip';
import { CH_CANTON_CODES } from '@/engine/holidays';
import type { Country, Locale } from '@/engine/types';
import { ensureStarterTypes, useStore } from '@/store/store';
import { LOCALE_NAMES, useT } from '@/i18n';
import { navigate } from '@/app/router';
import { cn } from '@/lib/cn';

const COUNTRIES: Country[] = ['CH', 'IT', 'DE', 'FR', 'AT', 'OTHER'];
const FLAGS: Record<Country, string> = { CH: '🇨🇭', IT: '🇮🇹', DE: '🇩🇪', FR: '🇫🇷', AT: '🇦🇹', OTHER: '🌍' };

export function Onboarding() {
  const t = useT();
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const pay = useStore((s) => s.pay);
  const setPay = useStore((s) => s.setPay);
  const [step, setStep] = useState(0);
  const [how, setHow] = useState<'photo' | 'pdf' | 'excel' | 'manual'>('photo');
  const accountsAvailable = useAccountsAvailable();

  const finish = (goImport: boolean, account = false) => {
    ensureStarterTypes(profile.locale);
    if (!pay.configured) {
      const eur = profile.country !== 'CH' && profile.country !== 'OTHER';
      setPay({ ...pay, currency: eur ? 'EUR' : 'CHF', rounding: eur ? 0.01 : 0.05 });
    }
    setProfile({ onboarded: true });
    if (account) navigate('/account');
    else navigate(goImport ? '/import' : '/', goImport && how !== 'manual' ? { source: how } : undefined);
  };

  const steps = [
    // 0 — welcome
    <div key="w" className="flex flex-col items-center text-center">
      <motion.div initial={{ scale: 0.8, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', damping: 14 }}>
        <Logo size={88} className="drop-shadow-[0_18px_30px_rgba(229,34,63,0.35)]" />
      </motion.div>
      <h1 className="mt-8 text-[32px] font-bold leading-tight tracking-[-0.035em] text-ink text-balance">{t.onboarding.welcome}</h1>
      <p className="mt-3 max-w-sm text-[16px] leading-relaxed text-muted text-balance">{t.onboarding.welcomeText}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-1.5">
        {(Object.keys(LOCALE_NAMES) as Locale[]).map((l) => (
          <button
            key={l}
            onClick={() => setProfile({ locale: l })}
            className={cn('rounded-full px-3.5 py-1.5 text-[13px] font-semibold ring-1 transition', profile.locale === l ? 'bg-ink text-bg ring-ink' : 'text-ink-2 ring-line-strong hover:bg-surface-2')}
          >
            {LOCALE_NAMES[l]}
          </button>
        ))}
      </div>
    </div>,

    // 1 — name
    <div key="n">
      <h2 className="text-[26px] font-bold tracking-[-0.03em] text-ink">{t.onboarding.you}</h2>
      <p className="mt-1.5 text-[15px] text-muted">{t.onboarding.youHint}</p>
      <div className="mt-6 space-y-4">
        <Field label={t.settings.name}>
          <Input autoFocus value={profile.name} onChange={(e) => setProfile({ name: e.target.value })} placeholder="Mario Rossi" autoComplete="name" />
        </Field>
        <Field label={t.settings.employer} hint={t.common.optional}>
          <Input value={profile.employer} onChange={(e) => setProfile({ employer: e.target.value })} placeholder="Es. Ristorante Lago SA" autoComplete="organization" />
        </Field>
      </div>
    </div>,

    // 2 — country
    <div key="c">
      <h2 className="text-[26px] font-bold tracking-[-0.03em] text-ink">{t.onboarding.where}</h2>
      <p className="mt-1.5 text-[15px] text-muted">{t.onboarding.whereHint}</p>
      <div className="mt-6 grid grid-cols-3 gap-2">
        {COUNTRIES.map((c) => (
          <button
            key={c}
            onClick={() => setProfile({ country: c, region: c === 'CH' ? profile.region || 'TI' : '' })}
            className={cn('flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3.5 ring-1 transition', profile.country === c ? 'bg-brand-soft ring-2 ring-brand' : 'bg-surface ring-line hover:bg-surface-2')}
          >
            <span className="text-[26px] leading-none">{FLAGS[c]}</span>
            <span className="text-[13px] font-semibold text-ink">{t.countries[c]}</span>
          </button>
        ))}
      </div>
      {profile.country === 'CH' && (
        <Field label={t.settings.region} className="mt-4">
          <Select value={profile.region} onChange={(e) => setProfile({ region: e.target.value })}>
            {CH_CANTON_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value="OTHER">{t.cantonOther}</option>
          </Select>
        </Field>
      )}
      <Field label={t.wizard.weeklyHours} hint={t.wizard.weeklyHoursHint} className="mt-4">
        <NumberInput value={profile.weeklyHours} onChange={(v) => setProfile({ weeklyHours: v })} suffix={t.common.h} min={0} placeholder="42" />
      </Field>
    </div>,

    // 3 — how
    <div key="h">
      <h2 className="text-[26px] font-bold tracking-[-0.03em] text-ink">{t.onboarding.how}</h2>
      <div className="mt-6 grid grid-cols-2 gap-2.5">
        {([
          ['photo', t.onboarding.howPhoto, <Camera key="i" className="size-6" />],
          ['pdf', t.onboarding.howPdf, <FileText key="i" className="size-6" />],
          ['excel', t.onboarding.howExcel, <FileSpreadsheet key="i" className="size-6" />],
          ['manual', t.onboarding.howManual, <PenLine key="i" className="size-6" />],
        ] as const).map(([k, label, icon]) => (
          <button
            key={k}
            onClick={() => setHow(k)}
            className={cn('flex flex-col items-start gap-3 rounded-3xl p-4 text-left ring-1 transition', how === k ? 'bg-brand-soft ring-2 ring-brand' : 'bg-surface ring-line hover:bg-surface-2')}
          >
            <span className={cn('flex size-11 items-center justify-center rounded-2xl', how === k ? 'brand-gradient text-white' : 'bg-surface-3 text-ink-2')}>{icon}</span>
            <span className="text-[15px] font-semibold text-ink">{label}</span>
          </button>
        ))}
      </div>
    </div>,

    // 4 — ready
    <div key="r" className="flex flex-col items-center text-center">
      <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', damping: 12 }}>
        <CheckCircle2 className="size-20 text-success" strokeWidth={1.5} />
      </motion.div>
      <h2 className="mt-6 text-[28px] font-bold tracking-[-0.03em] text-ink">{t.onboarding.ready}</h2>
      <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-muted">{t.onboarding.readyText}</p>
      {accountsAvailable && (
        <button onClick={() => finish(false, true)} className="mt-8 flex w-full items-start gap-3 rounded-3xl bg-surface p-4 text-left ring-1 ring-line transition hover:bg-surface-2">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-sky-500/12 text-sky-500"><Cloud className="size-5.5" /></span>
          <span>
            <span className="block text-[15px] font-semibold text-ink">{t.onboarding.accountTitle}</span>
            <span className="mt-0.5 block text-[13.5px] leading-snug text-muted">{t.onboarding.accountText}</span>
            <span className="mt-2 block text-[13.5px] font-semibold text-brand">{t.onboarding.accountCta} →</span>
          </span>
        </button>
      )}
    </div>,
  ];

  const last = step === steps.length - 1;
  return (
    <div className="flex min-h-dvh flex-col px-5 pt-[calc(env(safe-area-inset-top)+16px)] pb-[calc(env(safe-area-inset-bottom)+20px)]">
      <div className="mx-auto flex w-full max-w-md items-center justify-between">
        <button onClick={() => setStep((s) => Math.max(0, s - 1))} className={cn('flex size-10 items-center justify-center rounded-full text-ink-2 hover:bg-surface-3', step === 0 && 'invisible')} aria-label={t.common.back}>
          <ArrowLeft className="size-5" />
        </button>
        <div className="flex gap-1.5">
          {steps.map((_, i) => <span key={i} className={cn('h-1.5 rounded-full transition-all', i === step ? 'w-6 bg-brand' : i < step ? 'w-1.5 bg-brand/50' : 'w-1.5 bg-line-strong')} />)}
        </div>
        <button onClick={() => finish(false)} className={cn('px-2 text-[14px] font-semibold text-muted hover:text-ink', (step === 0 || last) && 'invisible')}>
          {t.onboarding.skip}
        </button>
      </div>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8">
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22 }}>
            {steps[step]}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="mx-auto w-full max-w-md space-y-2">
        {last ? (
          <>
            {how !== 'manual' && <Button variant="primary" size="lg" block onClick={() => finish(true)}>{t.onboarding.goImport}</Button>}
            <Button variant={how === 'manual' ? 'primary' : 'secondary'} size="lg" block onClick={() => finish(false)}>{t.onboarding.goToday}</Button>
          </>
        ) : (
          <Button variant="primary" size="lg" block onClick={() => setStep((s) => s + 1)}>
            {step === 0 ? t.onboarding.start : t.common.continue}
          </Button>
        )}
      </div>
    </div>
  );
}
