import { useEffect, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Database, Download, FlaskConical, KeyRound, Layers, Plus, ShieldCheck, Sparkles, Trash2, Upload, Wallet, Wand2, X } from 'lucide-react';
import { IconButton } from '@/components/ui/Button';
import { Card, Divided, ListRow, PageHeader, SectionTitle } from '@/components/ui/Card';
import { Field, Input, NumberInput, Segmented, Select, Switch } from '@/components/ui/Form';
import { Badge, confirmDialog, toast } from '@/components/ui/Feedback';
import { Logo } from '@/components/ShiftChip';
import { navigate, goBack } from '@/app/router';
import { aiStatus } from '@/ai/client';
import { CH_CANTON_CODES, holidaysForYear } from '@/engine/holidays';
import type { Country, Locale } from '@/engine/types';
import { useStore, type BackupData } from '@/store/store';
import { LOCALE_NAMES, useT } from '@/i18n';
import { useFmt } from '@/lib/format';
import { pickFile, saveFile } from '@/lib/files';
import { syncReminders } from '@/lib/reminders';
import { cn } from '@/lib/cn';

const COUNTRIES: Country[] = ['CH', 'IT', 'DE', 'FR', 'AT', 'OTHER'];
const VERSION = '1.0.0';

export function SettingsPage() {
  const t = useT();
  const f = useFmt();
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const ai = useStore((s) => s.ai);
  const setAi = useStore((s) => s.setAi);
  const [status, setStatus] = useState<{ configured: boolean; model: string } | null | 'loading'>('loading');
  const [newHoliday, setNewHoliday] = useState({ date: '', name: '' });
  const year = new Date().getFullYear();
  const native = Capacitor.isNativePlatform();

  useEffect(() => {
    aiStatus().then(setStatus);
  }, []);

  const yearHolidays = useMemo(
    () => [...holidaysForYear(year, { country: profile.country, region: profile.region, customHolidays: profile.customHolidays, ignoredHolidays: [] }).entries()].sort((a, b) => a[0].localeCompare(b[0])),
    [year, profile.country, profile.region, profile.customHolidays],
  );

  const exportBackup = async () => {
    const s = useStore.getState();
    const data: BackupData & { app: string; version: number; exportedAt: string } = {
      app: 'swissync-turni', version: 1, exportedAt: new Date().toISOString(),
      profile: s.profile, types: s.types, entries: s.entries, scripts: s.scripts, pay: s.pay, payslips: s.payslips, imports: s.imports,
      ai: { ...s.ai, apiKey: '' },
    };
    await saveFile(new Blob([JSON.stringify(data)], { type: 'application/json' }), `swissync-turni-backup-${new Date().toISOString().slice(0, 10)}.json`, { share: true });
    toast(t.toast.exported);
  };

  const restore = async () => {
    const file = await pickFile('application/json,.json');
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'swissync-turni') throw new Error('invalid');
      if (!(await confirmDialog({ title: t.settings.restore, text: t.settings.restoreConfirm, confirmLabel: t.common.confirm, cancelLabel: t.common.cancel }))) return;
      useStore.getState().replaceAll({ ...data, ai: { ...data.ai, apiKey: useStore.getState().ai.apiKey } });
      toast(t.settings.restored);
    } catch {
      toast(t.common.error, 'error');
    }
  };

  const demo = async () => {
    if (!(await confirmDialog({ title: t.settings.demo, text: t.settings.demoConfirm, confirmLabel: t.common.confirm, cancelLabel: t.common.cancel }))) return;
    const { loadDemo } = await import('@/lib/demo');
    loadDemo(profile.locale);
    navigate('/');
  };

  const reset = async () => {
    if (!(await confirmDialog({ title: t.settings.reset, text: t.settings.resetConfirm, confirmLabel: t.common.delete, cancelLabel: t.common.cancel, danger: true }))) return;
    useStore.getState().resetAll();
    navigate('/');
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t.settings.title} onBack={() => goBack('/')} />

      <Card className="overflow-hidden lg:hidden">
        <Divided>
          <ListRow icon={<Layers className="size-4.5" />} title={t.nav.types} onClick={() => navigate('/types')} />
          <ListRow icon={<Wand2 className="size-4.5" />} title={t.nav.scripts} onClick={() => navigate('/scripts')} />
          <ListRow icon={<Wallet className="size-4.5" />} title={t.earnings.editProfile} onClick={() => navigate('/pay-setup')} />
        </Divided>
      </Card>

      <SectionTitle>{t.settings.profile}</SectionTitle>
      <Card className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-5">
        <Field label={t.settings.name}><Input value={profile.name} onChange={(e) => setProfile({ name: e.target.value })} autoComplete="name" /></Field>
        <Field label={t.settings.employer}><Input value={profile.employer} onChange={(e) => setProfile({ employer: e.target.value })} /></Field>
        <Field label={t.settings.employeeId}><Input value={profile.employeeId} onChange={(e) => setProfile({ employeeId: e.target.value })} /></Field>
        <Field label={t.settings.department}><Input value={profile.department} onChange={(e) => setProfile({ department: e.target.value })} /></Field>
      </Card>

      <SectionTitle>{t.settings.work}</SectionTitle>
      <Card className="space-y-4 p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t.settings.weeklyHours}><NumberInput value={profile.weeklyHours} onChange={(v) => setProfile({ weeklyHours: v })} suffix={t.common.h} min={0} /></Field>
          <Field label={t.settings.workDays}><NumberInput value={profile.workDaysPerWeek} onChange={(v) => setProfile({ workDaysPerWeek: Math.min(7, Math.max(1, Math.round(v) || 5)) })} min={1} /></Field>
          <Field label={t.settings.country}>
            <Select value={profile.country} onChange={(e) => setProfile({ country: e.target.value as Country, region: e.target.value === 'CH' ? profile.region || 'TI' : '' })}>
              {COUNTRIES.map((c) => <option key={c} value={c}>{t.countries[c]}</option>)}
            </Select>
          </Field>
          {profile.country === 'CH' && (
            <Field label={t.settings.region}>
              <Select value={profile.region} onChange={(e) => setProfile({ region: e.target.value })}>
                {CH_CANTON_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value="OTHER">{t.cantonOther}</option>
              </Select>
            </Field>
          )}
        </div>
        <div>
          <div className="mb-2 px-0.5 text-[13px] font-semibold text-ink-2">{t.calendar.holiday} {year}</div>
          <div className="divide-y divide-line overflow-hidden rounded-2xl bg-surface-2 ring-1 ring-line">
            {yearHolidays.map(([date, id]) => {
              const ignored = profile.ignoredHolidays.includes(date);
              const custom = id.startsWith('custom:');
              return (
                <div key={date} className="flex items-center gap-3 px-3.5 py-2">
                  <span className="tabular w-20 shrink-0 text-[13px] text-muted">{f.date(date, 'd MMM')}</span>
                  <span className={cn('min-w-0 flex-1 truncate text-[14px]', ignored ? 'text-faint line-through' : 'text-ink')}>{custom ? id.slice(7) : t.holidays[id] ?? id}</span>
                  {custom ? (
                    <IconButton label={t.common.delete} size="sm" onClick={() => setProfile({ customHolidays: profile.customHolidays.filter((c) => c.date !== date) })}><X className="size-4" /></IconButton>
                  ) : (
                    <Switch checked={!ignored} onChange={(on) => setProfile({ ignoredHolidays: on ? profile.ignoredHolidays.filter((d) => d !== date) : [...profile.ignoredHolidays, date] })} />
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex gap-2">
            <Input type="date" value={newHoliday.date} onChange={(e) => setNewHoliday({ ...newHoliday, date: e.target.value })} className="h-11 w-44 shrink-0" />
            <Input value={newHoliday.name} onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })} placeholder={t.common.name} className="h-11" />
            <IconButton label={t.settings.addHoliday} variant="secondary" disabled={!newHoliday.date} className="size-11 rounded-2xl" onClick={() => { setProfile({ customHolidays: [...profile.customHolidays.filter((c) => c.date !== newHoliday.date), { date: newHoliday.date, name: newHoliday.name.trim() || t.calendar.holiday }] }); setNewHoliday({ date: '', name: '' }); }}>
              <Plus className="size-4.5" />
            </IconButton>
          </div>
        </div>
      </Card>

      <SectionTitle>{t.settings.appearance}</SectionTitle>
      <Card className="space-y-4 p-4 sm:p-5">
        <Field label={t.settings.theme}>
          <Segmented value={profile.theme} onChange={(v) => setProfile({ theme: v })} options={[{ value: 'system', label: t.settings.themeSystem }, { value: 'light', label: t.settings.themeLight }, { value: 'dark', label: t.settings.themeDark }]} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t.settings.language}>
            <Select value={profile.locale} onChange={(e) => setProfile({ locale: e.target.value as Locale })}>
              {(Object.keys(LOCALE_NAMES) as Locale[]).map((l) => <option key={l} value={l}>{LOCALE_NAMES[l]}</option>)}
            </Select>
          </Field>
          <Field label={t.settings.hoursFormat}>
            <Select value={profile.hoursFormat} onChange={(e) => setProfile({ hoursFormat: e.target.value as 'decimal' | 'hm' })}>
              <option value="decimal">{t.settings.hoursDecimal}</option>
              <option value="hm">{t.settings.hoursHm}</option>
            </Select>
          </Field>
        </div>
      </Card>

      <SectionTitle>{t.settings.features}</SectionTitle>
      <Card className="space-y-4 p-4 sm:p-5">
        <Switch checked={profile.clockEnabled} onChange={(v) => setProfile({ clockEnabled: v })} label={t.settings.clock} />
        <Switch
          checked={profile.reminders.enabled}
          disabled={!native}
          onChange={(v) => { setProfile({ reminders: { ...profile.reminders, enabled: v } }); setTimeout(syncReminders, 50); }}
          label={t.settings.reminders}
          hint={native ? undefined : t.settings.remindersNative}
        />
        {native && profile.reminders.enabled && (
          <Field label={t.settings.remindersBefore}>
            <NumberInput value={profile.reminders.minutesBefore} onChange={(v) => { setProfile({ reminders: { ...profile.reminders, minutesBefore: Math.max(0, Math.round(v)) } }); }} suffix={t.common.min} min={0} />
          </Field>
        )}
      </Card>

      <SectionTitle>{t.settings.ai}</SectionTitle>
      <Card className="space-y-4 p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {([
            ['cloud', t.settings.aiCloud, t.settings.aiCloudHint, <Sparkles key="i" className="size-5" />],
            ['own-key', t.settings.aiOwn, t.settings.aiOwnHint, <KeyRound key="i" className="size-5" />],
            ['off', t.settings.aiOff, t.settings.aiOffHint, <ShieldCheck key="i" className="size-5" />],
          ] as const).map(([mode, title, hint, icon]) => (
            <button key={mode} onClick={() => setAi({ mode })} className={cn('flex flex-col items-start gap-2 rounded-2xl p-3.5 text-left ring-1 transition', ai.mode === mode ? 'bg-brand-soft ring-2 ring-brand' : 'bg-surface-2 ring-line hover:bg-surface-3')}>
              <span className={cn('flex size-9 items-center justify-center rounded-xl', ai.mode === mode ? 'brand-gradient text-white' : 'bg-surface-3 text-ink-2')}>{icon}</span>
              <span className="text-[14.5px] font-semibold text-ink">{title}</span>
              <span className="text-[12.5px] leading-snug text-muted">{hint}</span>
            </button>
          ))}
        </div>
        {ai.mode === 'own-key' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1.6fr_1fr]">
            <Field label={t.settings.apiKey} hint={t.settings.apiKeyHint}>
              <Input type="password" value={ai.apiKey} onChange={(e) => setAi({ apiKey: e.target.value.trim() })} placeholder="xai-…" autoComplete="off" spellCheck={false} />
            </Field>
            <Field label={t.settings.model}>
              <Input value={ai.model} onChange={(e) => setAi({ model: e.target.value.trim() })} placeholder="grok-4.7" spellCheck={false} />
            </Field>
          </div>
        )}
        {ai.mode === 'cloud' && (
          <div className="flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3 text-[14px] ring-1 ring-line">
            <span className="text-muted">{t.settings.status}</span>
            {status === 'loading' ? <span className="text-muted">…</span> : status?.configured ? <Badge tone="success">{t.settings.statusOk(status.model)}</Badge> : status ? <Badge tone="warning">{t.settings.statusMissing}</Badge> : <Badge tone="danger">{t.settings.statusUnreachable}</Badge>}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([
            [t.settings.usageRequests, ai.usage.requests],
            [t.settings.usageScripts, ai.usage.scriptsCreated],
            [t.settings.usageLocal, ai.usage.localImports],
            [t.settings.usageAi, ai.usage.aiImports],
          ] as const).map(([label, n]) => (
            <div key={label} className="rounded-2xl bg-surface-2 p-3 ring-1 ring-line">
              <div className="tabular text-[20px] font-bold text-ink">{n}</div>
              <div className="text-[11.5px] leading-tight text-muted">{label}</div>
            </div>
          ))}
        </div>
      </Card>

      <SectionTitle>{t.settings.data}</SectionTitle>
      <Card className="overflow-hidden">
        <Divided>
          <ListRow icon={<Download className="size-4.5" />} title={t.settings.backup} onClick={exportBackup} />
          <ListRow icon={<Upload className="size-4.5" />} title={t.settings.restore} onClick={restore} />
          <ListRow icon={<FlaskConical className="size-4.5" />} title={t.settings.demo} onClick={demo} />
          <ListRow icon={<Trash2 className="size-4.5" />} title={t.settings.reset} onClick={reset} danger chevron={false} />
        </Divided>
      </Card>

      <SectionTitle>{t.settings.about}</SectionTitle>
      <Card className="flex items-start gap-4 p-4 sm:p-5">
        <Logo size={48} className="shrink-0" />
        <div className="min-w-0 text-[14px]">
          <div className="font-semibold text-ink">{t.app.name} <span className="font-normal text-muted">· {t.settings.version} {VERSION}</span></div>
          <div className="mt-0.5 text-muted">{t.app.platform}</div>
          <p className="mt-2 flex items-start gap-1.5 text-[13px] leading-relaxed text-muted"><Database className="mt-0.5 size-3.5 shrink-0" />{t.settings.privacyText}</p>
          <a href="./privacy.html" target="_blank" rel="noreferrer" className="mt-2 inline-block text-[13px] font-semibold text-brand">{t.settings.privacy} →</a>
        </div>
      </Card>
      <div className="h-6" />
    </div>
  );
}
