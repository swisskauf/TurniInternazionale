import { useState, type FormEvent } from 'react';
import { Check, CloudOff, Cloud, LogOut, Mail, RefreshCw, ShieldCheck, Sparkles, Trash2, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, Divided, ListRow, PageHeader, SectionTitle } from '@/components/ui/Card';
import { Checkbox, Field, Input, Segmented } from '@/components/ui/Form';
import { Badge, EmptyState, ProgressBar, Spinner, toast } from '@/components/ui/Feedback';
import { Sheet } from '@/components/ui/Sheet';
import { goBack, navigate } from '@/app/router';
import {
  AccountError, cancelCode, deleteAccount, requestPasswordReset, resendCode, signInWithEmail, signInWithProvider, signOut, signUpWithEmail, socialProviders, submitCode, useAccount,
} from '@/cloud/account';
import { syncNow } from '@/cloud/sync';
import { useStore } from '@/store/store';
import { useT } from '@/i18n';
import { useFmt } from '@/lib/format';
import { cn } from '@/lib/cn';

const errorOf = (e: unknown) => (e instanceof AccountError ? e.code : 'auth_failed');

function AppleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 17 20" className={className} aria-hidden="true" fill="currentColor">
      <path d="M14.06 10.6c-.02-2.13 1.74-3.15 1.82-3.2-1-1.45-2.54-1.65-3.08-1.67-1.31-.13-2.56.77-3.22.77-.67 0-1.69-.75-2.78-.73-1.43.02-2.75.83-3.48 2.11-1.49 2.58-.38 6.4 1.07 8.49.71 1.02 1.55 2.17 2.65 2.13 1.07-.04 1.47-.69 2.76-.69 1.29 0 1.65.69 2.78.67 1.15-.02 1.87-1.04 2.57-2.07.81-1.18 1.14-2.33 1.16-2.39-.03-.01-2.22-.85-2.25-3.42ZM11.95 4.34c.58-.71.98-1.69.87-2.67-.84.03-1.86.56-2.46 1.27-.54.62-1.01 1.62-.89 2.58.94.07 1.9-.48 2.48-1.18Z" />
    </svg>
  );
}

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 18 18" className={className} aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}

export function AccountPage() {
  const t = useT();
  const status = useAccount((s) => s.status);
  const pending = useAccount((s) => s.pending);

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={t.account.title} onBack={() => goBack('/settings')} />
      {status === 'unavailable' && <EmptyState icon={<CloudOff className="size-7" />} title={t.account.title} text={t.account.unavailable} />}
      {status === 'loading' && <div className="flex justify-center py-16"><Spinner /></div>}
      {status === 'signed-out' && (pending ? <CodeForm /> : <SignIn />)}
      {status === 'signed-in' && <SignedIn />}
    </div>
  );
}

function SignIn() {
  const t = useT();
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const config = useAccount((s) => s.config);
  const { apple: showApple, google: showGoogle } = socialProviders(config);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(t.account.errors[errorOf(e)] ?? t.account.errors.auth_failed);
    } finally {
      setBusy(null);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'reset') return run('email', () => requestPasswordReset(email));
    if (mode === 'up') return run('email', async () => {
      if (password.length < 8) throw new AccountError('weak_password');
      await signUpWithEmail(email, password);
    });
    return run('email', () => signInWithEmail(email, password));
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="relative bg-[radial-gradient(120%_120%_at_0%_0%,#2a1630_0%,#0f1424_60%)] px-5 pb-5 pt-6 text-white">
          <span className="flex size-12 items-center justify-center rounded-2xl brand-gradient shadow-[0_10px_24px_-10px_rgba(229,34,63,0.8)]"><UserRound className="size-6" /></span>
          <h2 className="mt-4 text-[22px] font-bold tracking-[-0.02em]">{t.account.heroTitle}</h2>
          <p className="mt-1 text-[14.5px] leading-relaxed text-white/70">{t.account.heroText}</p>
          <ul className="mt-4 space-y-2 text-[14px] text-white/90">
            {[t.account.benefitSync, t.account.benefitBackup, t.account.benefitAi(6)].map((b) => (
              <li key={b} className="flex items-start gap-2.5"><Check className="mt-0.5 size-4 shrink-0 text-emerald-400" />{b}</li>
            ))}
          </ul>
        </div>
        <div className="space-y-2.5 p-4 sm:p-5">
          {showApple && (
            <Button block size="lg" variant="ink" icon={<AppleLogo className="size-[18px]" />} loading={busy === 'apple'} disabled={!!busy} onClick={() => run('apple', () => signInWithProvider('apple'))}>
              {t.account.withApple}
            </Button>
          )}
          {showGoogle && (
            <Button block size="lg" icon={<GoogleLogo className="size-[18px]" />} loading={busy === 'google'} disabled={!!busy} onClick={() => run('google', () => signInWithProvider('google'))}>
              {t.account.withGoogle}
            </Button>
          )}
          {(showApple || showGoogle) && (
            <div className="flex items-center gap-3 py-1.5 text-[12.5px] font-medium text-faint">
              <span className="h-px flex-1 bg-line" />{t.account.orEmail}<span className="h-px flex-1 bg-line" />
            </div>
          )}
          {mode !== 'reset' && (
            <Segmented value={mode} onChange={(v) => setMode(v as 'in' | 'up')} options={[{ value: 'in', label: t.account.signIn }, { value: 'up', label: t.account.signUp }]} />
          )}
          <form onSubmit={submit} className="space-y-3 pt-1">
            <Field label={t.account.email}>
              <Input type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@email.ch" />
            </Field>
            {mode !== 'reset' && (
              <Field label={t.account.password} hint={mode === 'up' ? t.account.passwordHint : undefined}>
                <Input type="password" autoComplete={mode === 'up' ? 'new-password' : 'current-password'} required minLength={mode === 'up' ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
            )}
            {error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-[13.5px] text-ink ring-1 ring-danger/25">{error}</p>}
            <Button type="submit" variant="primary" block size="lg" loading={busy === 'email'} disabled={!!busy && busy !== 'email'}>
              {mode === 'reset' ? t.account.sendReset : mode === 'up' ? t.account.signUp : t.account.signIn}
            </Button>
          </form>
          <div className="flex items-center justify-between pt-1 text-[13px]">
            <button type="button" className="font-semibold text-brand" onClick={() => { setMode(mode === 'reset' ? 'in' : 'reset'); setError(''); }}>
              {mode === 'reset' ? t.account.signIn : t.account.forgot}
            </button>
            <a href="privacy.html" target="_blank" rel="noreferrer" className="text-muted underline-offset-2 hover:underline">{t.account.privacy}</a>
          </div>
        </div>
      </Card>
      <p className="px-1 text-[13px] leading-relaxed text-muted">{t.account.benefitLocal} {t.account.legal}</p>
    </div>
  );
}

/** The 6-digit code sent by e-mail (confirm the address, or set a new password). */
function CodeForm() {
  const t = useT();
  const pending = useAccount((s) => s.pending)!;
  const debugCode = useAccount((s) => s.debugCode);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reset = pending.purpose === 'reset';
  const ready = code.replace(/\D/g, '').length === 6 && (!reset || password.length >= 8);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await submitCode(code.replace(/\D/g, ''), reset ? password : undefined);
      if (reset) toast(t.account.passwordUpdated);
    } catch (err) {
      setError(t.account.errors[errorOf(err)] ?? t.account.errors.auth_failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4 sm:p-5">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-sky-500/12 text-sky-500"><Mail className="size-6" /></span>
      <h2 className="mt-4 text-[20px] font-bold tracking-[-0.02em] text-ink">{t.account.codeTitle}</h2>
      <p className="mt-1 text-[14.5px] leading-relaxed text-muted">{t.account.codeText(pending.email)}</p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <Field label={t.account.code}>
          <Input
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))}
            placeholder="123456"
            className="tabular text-center text-[24px] font-semibold tracking-[0.4em]"
          />
        </Field>
        {debugCode && <p className="text-[12.5px] text-faint">dev: {debugCode}</p>}
        {reset && (
          <Field label={t.account.newPassword} hint={t.account.passwordHint}>
            <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        )}
        {error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-[13.5px] text-ink ring-1 ring-danger/25">{error}</p>}
        <Button type="submit" variant="primary" block size="lg" loading={busy} disabled={!ready}>{t.account.confirmCode}</Button>
      </form>
      <div className="mt-3 flex items-center justify-between text-[13px]">
        <button type="button" className="font-semibold text-brand" onClick={async () => {
          try {
            await resendCode();
            toast(t.account.resent);
          } catch (err) {
            setError(t.account.errors[errorOf(err)] ?? t.account.errors.auth_failed);
          }
        }}>{t.account.resend}</button>
        <button type="button" className="text-muted hover:text-ink" onClick={cancelCode}>{t.account.changeEmail}</button>
      </div>
    </Card>
  );
}

const PROVIDER_NAMES: Record<string, string> = { apple: 'Apple', google: 'Google', email: 'Email' };

function SignedIn() {
  const t = useT();
  const f = useFmt();
  const user = useAccount((s) => s.user)!;
  const quota = useAccount((s) => s.quota);
  const sync = useAccount((s) => s.sync.state);
  const lastSyncAt = useStore((s) => s.cloud.lastSyncAt);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [alsoDevice, setAlsoDevice] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const syncLine =
    sync === 'syncing' ? t.account.syncing : sync === 'error' ? t.account.syncError : sync === 'offline' ? t.account.syncOffline : lastSyncAt ? t.account.syncedAt(f.ago(lastSyncAt)) : t.account.syncNever;
  const left = quota ? Math.max(0, quota.limit - quota.used) : null;

  return (
    <div>
      <Card className="flex items-center gap-4 p-4 sm:p-5">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full brand-gradient text-[22px] font-bold text-white">
          {(user.name || user.email || '?').trim()[0]?.toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-medium text-muted">{t.account.signedInAs}</div>
          <div className="truncate text-[17px] font-semibold text-ink">{user.name || user.email}</div>
          {user.name && <div className="truncate text-[13.5px] text-muted">{user.email}</div>}
        </div>
        {user.providers[0] && <Badge>{t.account.via(PROVIDER_NAMES[user.providers[0]] ?? user.providers[0])}</Badge>}
      </Card>

      <SectionTitle>{t.account.syncTitle}</SectionTitle>
      <Card className="flex items-center gap-3.5 p-4">
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', sync === 'error' ? 'bg-danger/10 text-danger' : sync === 'offline' ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success')}>
          {sync === 'offline' ? <CloudOff className="size-5" /> : sync === 'syncing' ? <RefreshCw className="size-5 animate-spin" /> : <Cloud className="size-5" />}
        </span>
        <p className="min-w-0 flex-1 text-[14.5px] text-ink-2">{syncLine}</p>
        <Button size="sm" icon={<RefreshCw className="size-4" />} disabled={sync === 'syncing'} onClick={() => void syncNow()}>{t.account.syncNow}</Button>
      </Card>

      <SectionTitle>{t.account.aiTitle}</SectionTitle>
      <Card className="p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/12 text-violet-500"><Sparkles className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-ink">{left == null ? '—' : left > 0 ? t.account.aiLeft(left) : t.account.aiNone}</div>
            {quota && <div className="text-[13px] text-muted">{t.account.aiUsage(quota.used, quota.limit)}</div>}
          </div>
        </div>
        {quota && <ProgressBar className="mt-3" value={quota.limit ? quota.used / quota.limit : 0} />}
        <p className="mt-3 flex items-start gap-2 text-[13px] leading-snug text-muted"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />{t.account.aiHint}</p>
      </Card>

      <Card className="mt-6 overflow-hidden">
        <Divided>
          <ListRow icon={<LogOut className="size-4.5" />} title={t.account.signOut} subtitle={t.account.signOutHint} onClick={() => void signOut()} />
          <ListRow icon={<Trash2 className="size-4.5" />} title={t.account.delete} subtitle={t.account.deleteHint} danger onClick={() => setConfirmDelete(true)} />
        </Divided>
      </Card>

      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t.account.deleteTitle}
        closeLabel={t.common.close}
        footer={
          <Button variant="danger" block loading={deleting} onClick={async () => {
            setDeleting(true);
            setError('');
            try {
              await deleteAccount(alsoDevice);
              setConfirmDelete(false);
              toast(t.account.deleted);
              navigate('/');
            } catch (e) {
              setError(t.account.errors[errorOf(e)] ?? t.account.errors.delete_failed);
            } finally {
              setDeleting(false);
            }
          }}>
            {t.account.deleteConfirm}
          </Button>
        }
      >
        <p className="text-[14.5px] leading-relaxed text-ink-2">{t.account.deleteText}</p>
        <Checkbox className="mt-4" checked={alsoDevice} onChange={setAlsoDevice} label={t.account.deleteDevice} />
        {error && <p role="alert" className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-[13.5px] text-ink ring-1 ring-danger/25">{error}</p>}
      </Sheet>
    </div>
  );
}
