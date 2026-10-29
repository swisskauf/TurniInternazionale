import { lazy, Suspense, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ConfirmHost, Spinner, Toaster } from '@/components/ui/Feedback';
import { Logo } from '@/components/ShiftChip';
import { DayEditorHost } from '@/features/day/DayEditor';
import { TodayPage } from '@/features/today/TodayPage';
import { Onboarding } from '@/features/onboarding/Onboarding';
import { useStore } from '@/store/store';
import { initAccount } from '@/cloud/account';
import { Layout } from './Layout';
import { useRoute } from './router';
import { useThemeEffect } from './hooks';

const CalendarPage = lazy(() => import('@/features/calendar/CalendarPage').then((m) => ({ default: m.CalendarPage })));
const ImportPage = lazy(() => import('@/features/import/ImportPage').then((m) => ({ default: m.ImportPage })));
const HoursPage = lazy(() => import('@/features/hours/HoursPage').then((m) => ({ default: m.HoursPage })));
const EarningsPage = lazy(() => import('@/features/earnings/EarningsPage').then((m) => ({ default: m.EarningsPage })));
const PaySetupPage = lazy(() => import('@/features/earnings/PaySetupPage').then((m) => ({ default: m.PaySetupPage })));
const TypesPage = lazy(() => import('@/features/types/TypesPage').then((m) => ({ default: m.TypesPage })));
const ScriptsPage = lazy(() => import('@/features/scripts/ScriptsPage').then((m) => ({ default: m.ScriptsPage })));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const AccountPage = lazy(() => import('@/features/account/AccountPage').then((m) => ({ default: m.AccountPage })));

function Page() {
  const { path } = useRoute();
  switch (path) {
    case '/calendar':
      return <CalendarPage />;
    case '/import':
      return <ImportPage />;
    case '/hours':
      return <HoursPage />;
    case '/earnings':
      return <EarningsPage />;
    case '/pay-setup':
      return <PaySetupPage />;
    case '/types':
      return <TypesPage />;
    case '/scripts':
      return <ScriptsPage />;
    case '/settings':
      return <SettingsPage />;
    case '/account':
      return <AccountPage />;
    default:
      return <TodayPage />;
  }
}

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        <Logo size={64} />
      </motion.div>
    </div>
  );
}

export function App() {
  useThemeEffect();
  const hydrated = useStore((s) => s.hydrated);
  const onboarded = useStore((s) => s.profile.onboarded);
  const locale = useStore((s) => s.profile.locale);
  const { path } = useRoute();

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  // Keep native shift reminders in sync with the plan.
  const entries = useStore((s) => s.entries);
  const reminders = useStore((s) => s.profile.reminders);
  useEffect(() => {
    if (!hydrated || !reminders.enabled) return;
    const id = setTimeout(() => import('@/lib/reminders').then((m) => m.syncReminders()), 1500);
    return () => clearTimeout(id);
  }, [hydrated, entries, reminders]);

  // Account session (also completes email links and web sign-in redirects).
  useEffect(() => {
    if (hydrated) void initAccount();
  }, [hydrated]);

  // `?demo=it` loads sample data (store screenshots, presentations).
  useEffect(() => {
    if (!hydrated) return;
    const demo = new URLSearchParams(window.location.search).get('demo');
    if (!demo) return;
    import('@/lib/demo').then((m) => {
      m.loadDemo((['it', 'en', 'de', 'fr'].includes(demo) ? demo : 'it') as never);
      window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    });
  }, [hydrated]);

  if (!hydrated) return <Splash />;
  if (!onboarded) return (
    <>
      <Onboarding />
      <Toaster />
    </>
  );

  return (
    <>
      <Layout>
        <Suspense fallback={<div className="flex justify-center py-24"><Spinner /></div>}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={path} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
              <Page />
            </motion.div>
          </AnimatePresence>
        </Suspense>
      </Layout>
      <DayEditorHost />
      <ConfirmHost />
      <Toaster />
    </>
  );
}
