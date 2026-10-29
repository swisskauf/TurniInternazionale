import { Capacitor } from '@capacitor/core';
import { addDays, fromISO, todayISO } from '@/engine/dates';
import { resolveEntry } from '@/engine/hours';
import { parseHM } from '@/engine/time';
import { getT } from '@/i18n';
import { useStore } from '@/store/store';

/**
 * Schedules local notifications before the next two weeks of shifts (iOS/Android only).
 * Re-run whenever the plan or the reminder settings change: it replaces previous ones.
 */
export async function syncReminders(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const { profile, entries, types } = useStore.getState();
  const pending = await LocalNotifications.getPending().catch(() => ({ notifications: [] }));
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  if (!profile.reminders.enabled) return;
  const perm = await LocalNotifications.checkPermissions();
  if (perm.display !== 'granted') {
    const req = await LocalNotifications.requestPermissions();
    if (req.display !== 'granted') return;
  }
  const t = getT();
  const now = Date.now();
  const notifications = [];
  const today = todayISO();
  for (let i = 0; i < 14; i++) {
    const date = addDays(today, i);
    const entry = entries[date];
    if (!entry) continue;
    const { type, segments, kind } = resolveEntry(entry, types);
    if ((kind !== 'work' && kind !== 'training') || !segments.length) continue;
    const start = parseHM(segments[0].start);
    if (start == null) continue;
    const at = fromISO(date);
    at.setMinutes(start - profile.reminders.minutesBefore);
    if (at.getTime() <= now) continue;
    notifications.push({
      id: Number(date.replace(/-/g, '')) % 2147483647,
      title: `${type?.code ?? entry.code} · ${segments[0].start}`,
      body: `${type?.name ?? t.kinds[kind]} — ${segments.map((s) => `${s.start}–${s.end}`).join(' · ')}`,
      schedule: { at, allowWhileIdle: true },
    });
  }
  if (notifications.length) await LocalNotifications.schedule({ notifications });
}
