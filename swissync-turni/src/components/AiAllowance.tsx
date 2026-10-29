import { useEffect } from 'react';
import { LogIn, Sparkles } from 'lucide-react';
import { navigate } from '@/app/router';
import { refreshQuota, useAccount, useAccountsAvailable } from '@/cloud/account';
import { useStore } from '@/store/store';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';

/** "4 xAI analyses left this month", or how to get them (sign in), next to every xAI action. */
export function AiAllowance({ className }: { className?: string }) {
  const t = useT();
  const mode = useStore((s) => s.ai.mode);
  const user = useAccount((s) => s.user);
  const quota = useAccount((s) => s.quota);
  const accountsAvailable = useAccountsAvailable();
  useEffect(() => {
    if (user) void refreshQuota();
  }, [user]);
  if (!accountsAvailable || mode !== 'cloud') return null;
  if (!user) {
    return (
      <button type="button" onClick={() => navigate('/account')} className={cn('flex w-full items-center gap-2 rounded-xl bg-violet-500/8 px-3 py-2 text-left text-[13px] font-medium text-violet-600 ring-1 ring-violet-500/20 transition hover:bg-violet-500/12 dark:text-violet-300', className)}>
        <LogIn className="size-4 shrink-0" /> {t.account.aiLogin}
      </button>
    );
  }
  if (!quota) return null;
  const left = Math.max(0, quota.limit - quota.used);
  return (
    <p className={cn('flex items-center gap-2 text-[13px] font-medium', left ? 'text-violet-600 dark:text-violet-300' : 'text-warning', className)}>
      <Sparkles className="size-4 shrink-0" /> {left ? t.account.aiLeft(left) : t.account.aiNone}
    </p>
  );
}
