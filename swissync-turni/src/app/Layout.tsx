import type { ReactNode } from 'react';
import { CalendarDays, Clock3, House, Layers, ScanLine, Settings, UserRound, Wallet, Wand2 } from 'lucide-react';
import { useAccountsAvailable } from '@/cloud/account';
import { cn } from '@/lib/cn';
import { Logo } from '@/components/ShiftChip';
import { useT } from '@/i18n';
import { navigate, useRoute, type RoutePath } from './router';

interface NavItem {
  path: RoutePath;
  label: string;
  icon: ReactNode;
}

export function Layout({ children }: { children: ReactNode }) {
  const t = useT();
  const { path } = useRoute();
  const accountsAvailable = useAccountsAvailable();
  const main: NavItem[] = [
    { path: '/', label: t.nav.today, icon: <House className="size-[22px]" /> },
    { path: '/calendar', label: t.nav.calendar, icon: <CalendarDays className="size-[22px]" /> },
    { path: '/import', label: t.nav.import, icon: <ScanLine className="size-[22px]" /> },
    { path: '/hours', label: t.nav.hours, icon: <Clock3 className="size-[22px]" /> },
    { path: '/earnings', label: t.nav.earnings, icon: <Wallet className="size-[22px]" /> },
  ];
  const secondary: NavItem[] = [
    { path: '/types', label: t.nav.types, icon: <Layers className="size-5" /> },
    { path: '/scripts', label: t.nav.scripts, icon: <Wand2 className="size-5" /> },
    ...(accountsAvailable ? [{ path: '/account' as RoutePath, label: t.nav.account, icon: <UserRound className="size-5" /> }] : []),
    { path: '/settings', label: t.nav.settings, icon: <Settings className="size-5" /> },
  ];
  const active = (p: RoutePath) => path === p || (p === '/earnings' && path === '/pay-setup');

  return (
    <div className="min-h-dvh lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-[264px] shrink-0 flex-col border-r border-line bg-surface/60 px-4 py-6 backdrop-blur-xl lg:flex">
        <button onClick={() => navigate('/')} className="mb-8 flex items-center gap-3 px-2 text-left">
          <Logo size={38} />
          <span>
            <span className="block text-[16px] font-bold leading-tight tracking-[-0.02em] text-ink">Swissync</span>
            <span className="block text-[13px] font-medium text-muted">Turni</span>
          </span>
        </button>
        <nav className="flex flex-col gap-1">
          {main.map((item) => (
            <SideLink key={item.path} item={item} active={active(item.path)} />
          ))}
        </nav>
        <div className="my-5 h-px bg-line" />
        <nav className="flex flex-col gap-1">
          {secondary.map((item) => (
            <SideLink key={item.path} item={item} active={active(item.path)} />
          ))}
        </nav>
        <div className="mt-auto px-3 text-[12px] leading-relaxed text-faint">{t.app.platform}</div>
      </aside>

      <main className="pb-nav mx-auto w-full max-w-[1120px] px-4 pt-[calc(env(safe-area-inset-top)+12px)] sm:px-6 lg:px-10 lg:pb-12 lg:pt-8">
        {children}
      </main>

      {/* Mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] lg:hidden">
        <div className="glass mx-auto flex max-w-md items-center justify-around rounded-[26px] px-1.5 py-1.5 shadow-float ring-1 ring-line">
          {main.map((item) =>
            item.path === '/import' ? (
              <button
                key={item.path}
                onClick={() => navigate('/import')}
                aria-label={item.label}
                className={cn(
                  'brand-gradient -my-4 flex size-14 items-center justify-center rounded-[20px] text-white shadow-[0_10px_24px_-8px_rgba(229,34,63,0.7)] ring-4 ring-bg transition active:scale-95',
                )}
              >
                <ScanLine className="size-6" />
              </button>
            ) : (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  'flex min-w-[58px] flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 text-[10.5px] font-semibold transition',
                  active(item.path) ? 'text-brand' : 'text-muted',
                )}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ),
          )}
        </div>
      </nav>
    </div>
  );
}

function SideLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <button
      onClick={() => navigate(item.path)}
      className={cn(
        'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14.5px] font-semibold transition',
        active ? 'bg-brand-soft text-brand' : 'text-ink-2 hover:bg-surface-3/70',
      )}
    >
      {item.icon}
      {item.label}
    </button>
  );
}
