import { useMemo } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, ArrowRight, CalendarDays, Coffee, FileUp, Layers, LogIn, LogOut, Moon, PenLine, Settings, Sun, Sunrise, Wallet } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, SectionTitle, Stat } from '@/components/ui/Card';
import { Ring, toast } from '@/components/ui/Feedback';
import { ShiftChip, barClass, Logo } from '@/components/ShiftChip';
import { Timeline } from '@/components/Timeline';
import { useDayEditor } from '@/features/day/DayEditor';
import { useCalcOptions, useNow, useSummary } from '@/app/hooks';
import { navigate } from '@/app/router';
import { addDays, diffDays, fromISO, makeISO, monthRange, payPeriodFor, startOfWeek, todayISO, weekdayIndex } from '@/engine/dates';
import { computeDay, type DayCalc } from '@/engine/hours';
import { calculatePay } from '@/engine/pay';
import { fmtHM, fmtSegments, toAbsoluteIntervals } from '@/engine/time';
import { useStore } from '@/store/store';
import { useT } from '@/i18n';
import { formatCountdown, useFmt } from '@/lib/format';
import { cn } from '@/lib/cn';

interface LiveStatus {
  state: 'before' | 'active' | 'break' | 'after' | 'off' | 'none';
  minutes: number;
  workedMin: number;
  plannedMin: number;
  calc?: DayCalc;
}

/** Where we are relative to a day's shift (handles shifts that started yesterday). */
function liveStatus(today: DayCalc, yesterday: DayCalc, nowMin: number): LiveStatus {
  const yIv = toAbsoluteIntervals(yesterday.segments).filter(([, e]) => e > 1440 + nowMin);
  if ((yesterday.kind === 'work' || yesterday.kind === 'training') && yIv.length) {
    const t = nowMin + 1440;
    const cur = yIv.find(([s, e]) => t >= s && t < e);
    if (cur) {
      const all = toAbsoluteIntervals(yesterday.segments);
      const worked = all.reduce((sum, [s, e]) => sum + Math.max(0, Math.min(e, t) - s), 0);
      const gross = all.reduce((sum, [s, e]) => sum + (e - s), 0);
      return { state: 'active', minutes: yIv[yIv.length - 1][1] - t, workedMin: worked, plannedMin: gross, calc: yesterday };
    }
  }
  if (!today.entry) return { state: 'none', minutes: 0, workedMin: 0, plannedMin: 0 };
  if (today.kind !== 'work' && today.kind !== 'training') return { state: 'off', minutes: 0, workedMin: 0, plannedMin: 0, calc: today };
  const iv = toAbsoluteIntervals(today.segments);
  if (!iv.length) return { state: 'off', minutes: 0, workedMin: 0, plannedMin: 0, calc: today };
  const worked = iv.reduce((sum, [s, e]) => sum + Math.max(0, Math.min(e, nowMin) - s), 0);
  const gross = iv.reduce((sum, [s, e]) => sum + (e - s), 0);
  const base = { workedMin: worked, plannedMin: gross, calc: today };
  if (nowMin < iv[0][0]) return { state: 'before', minutes: iv[0][0] - nowMin, ...base };
  const last = iv[iv.length - 1][1];
  if (nowMin >= last) return { state: 'after', minutes: 0, ...base };
  const inSeg = iv.find(([s, e]) => nowMin >= s && nowMin < e);
  if (inSeg) return { state: 'active', minutes: last - nowMin, ...base };
  const next = iv.find(([s]) => s > nowMin)!;
  return { state: 'break', minutes: next[0] - nowMin, ...base };
}

export function TodayPage() {
  const t = useT();
  const f = useFmt();
  const now = useNow(30_000);
  const today = todayISO(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const profile = useStore((s) => s.profile);
  const entries = useStore((s) => s.entries);
  const types = useStore((s) => s.types);
  const pay = useStore((s) => s.pay);
  const setEntry = useStore((s) => s.setEntry);
  const opts = useCalcOptions();
  const openDay = useDayEditor((s) => s.open);

  const todayCalc = useMemo(() => computeDay(today, entries[today], types, opts), [today, entries, types, opts]);
  const yCalc = useMemo(() => computeDay(addDays(today, -1), entries[addDays(today, -1)], types, opts), [today, entries, types, opts]);
  const status = liveStatus(todayCalc, yCalc, nowMin);

  const weekStart = startOfWeek(today);
  const week = useSummary(weekStart, addDays(weekStart, 6));
  const d = fromISO(today);
  const month = monthRange(d.getFullYear(), d.getMonth() + 1);
  const monthSum = useSummary(month.start, month.end);
  const period = payPeriodFor(today, pay.periodStartDay);
  const periodSum = useSummary(period.start, period.end);
  const payResult = pay.configured ? calculatePay(periodSum, pay, profile.weeklyHours) : null;

  const paydayISO = useMemo(() => {
    const [y, m] = period.label.split('-').map(Number);
    const pm = pay.paidNextMonth ? m + 1 : m;
    const date = new Date(y, pm - 1, 1);
    const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    return makeISO(date.getFullYear(), date.getMonth() + 1, Math.min(pay.payday || 25, last))!;
  }, [period.label, pay.paidNextMonth, pay.payday]);

  const upcoming = useMemo(() => {
    const out: DayCalc[] = [];
    for (let i = 1; i <= 14 && out.length < 5; i++) {
      const date = addDays(today, i);
      const e = entries[date];
      if (e) out.push(computeDay(date, e, types, opts));
    }
    return out;
  }, [today, entries, types, opts]);

  const hasAnything = Object.keys(entries).length > 0;
  const hour = now.getHours();
  const greeting = hour < 12 ? t.today.greetingMorning : hour < 18 ? t.today.greetingAfternoon : t.today.greetingEvening;
  const firstName = profile.name.split(' ')[0];

  // A punch started before midnight belongs to yesterday's shift.
  const yesterday = addDays(today, -1);
  const clockDate = entries[today]?.clockIn ? today : entries[yesterday]?.clockIn ? yesterday : today;
  const clockEntry = entries[clockDate];
  const clockedIn = !!clockEntry?.clockIn;
  const clock = () => {
    const nowHM = fmtHM(nowMin);
    if (!clockedIn) {
      const base = clockEntry ?? { date: today, code: '', kind: 'work' as const, origin: 'clock' as const, updatedAt: Date.now() };
      setEntry(today, { ...base, clockIn: nowHM, manual: true });
      toast(t.today.clockedSince(nowHM));
    } else {
      const segs = clockEntry.origin === 'clock' || clockEntry.segments?.length ? [...(clockEntry.segments ?? [])] : [];
      segs.push({ start: clockEntry.clockIn!, end: nowHM });
      setEntry(clockDate, { ...clockEntry, clockIn: undefined, segments: segs, manual: true, code: clockEntry.code || fmtSegments(segs) });
      toast(t.common.done);
    }
  };

  const activeCalc = status.calc ?? todayCalc;
  const statusText =
    status.state === 'before' ? t.today.startsIn(formatCountdown(status.minutes))
      : status.state === 'active' ? t.today.endsIn(formatCountdown(status.minutes))
        : status.state === 'break' ? t.today.breakNow(formatCountdown(status.minutes))
          : status.state === 'after' ? t.today.finished
            : status.state === 'off' ? t.today.dayOffHint
              : t.today.noShiftHint;

  return (
    <div>
      <header className="mb-5 flex items-center justify-between gap-3 px-1 pt-2">
        <div className="flex min-w-0 items-center gap-3">
          <Logo size={40} className="shrink-0 lg:hidden" />
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-muted">{f.dateCap(today, 'EEEE d MMMM')}</div>
            <h1 className="truncate text-[24px] font-bold leading-tight tracking-[-0.03em] text-ink sm:text-[28px]">
              {greeting}{firstName ? `, ${firstName}` : ''}
            </h1>
          </div>
        </div>
        <IconButton label={t.nav.settings} variant="secondary" onClick={() => navigate('/settings')} className="lg:hidden">
          <Settings className="size-5" />
        </IconButton>
      </header>

      {!hasAnything && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="hero-gradient relative overflow-hidden p-6 text-white ring-0 sm:p-8">
            <div className="max-w-lg">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[12px] font-semibold text-white/80 ring-1 ring-white/15">
                <Sunrise className="size-3.5" /> {t.app.name}
              </div>
              <h2 className="text-[26px] font-bold leading-tight tracking-[-0.03em]">{t.today.welcomeTitle}</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-white/70">{t.today.welcomeText}</p>
              <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
                <Button variant="primary" size="lg" icon={<FileUp className="size-5" />} onClick={() => navigate('/import')}>
                  {t.today.startImport}
                </Button>
                <Button size="lg" className="bg-white/10 text-white ring-white/20 hover:bg-white/15" icon={<PenLine className="size-5" />} onClick={() => openDay(today)}>
                  {t.today.startManual}
                </Button>
              </div>
              <button onClick={() => navigate('/types')} className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-semibold text-white/75 hover:text-white">
                <Layers className="size-4" /> {t.today.defineTypes} <ArrowRight className="size-4" />
              </button>
            </div>
          </Card>
        </motion.div>
      )}

      {hasAnything && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_1fr]">
          {/* Hero: today's shift */}
          <Card className="hero-gradient relative overflow-hidden p-5 text-white ring-0 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-white/60">
                  {status.state === 'active' && <span className="relative flex size-2.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-2 opacity-75" /><span className="relative inline-flex size-2.5 rounded-full bg-brand-2" /></span>}
                  {status.state === 'active' ? t.today.inProgress : t.common.today}
                </div>
                <div className="mt-2 flex items-center gap-3">
                  {activeCalc.entry ? (
                    <ShiftChip code={activeCalc.code} type={activeCalc.type} kind={activeCalc.kind} unknown={activeCalc.unknown} size="lg" solid />
                  ) : (
                    <span className="flex size-12 items-center justify-center rounded-2xl bg-white/10"><Coffee className="size-6 text-white/70" /></span>
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-[20px] font-bold tracking-[-0.02em]">
                      {activeCalc.type?.name ?? (activeCalc.entry ? (activeCalc.kind !== 'none' ? t.kinds[activeCalc.kind] : activeCalc.code) : t.today.noShift)}
                    </div>
                    <div className="tabular truncate text-[14px] text-white/65">
                      {activeCalc.segments.length && (activeCalc.kind === 'work' || activeCalc.kind === 'training') ? fmtSegments(activeCalc.segments) : status.state === 'off' ? t.today.dayOff : '—'}
                    </div>
                  </div>
                </div>
              </div>
              {(activeCalc.kind === 'work' || activeCalc.kind === 'training') && status.plannedMin > 0 && (
                <Ring value={status.plannedMin ? status.workedMin / status.plannedMin : 0} size={72} stroke={7} track="rgba(255,255,255,0.12)" color="#ff5a68">
                  <div className="text-center leading-none">
                    <div className="tabular text-[15px] font-bold">{f.minutes(status.workedMin)}</div>
                    <div className="mt-0.5 text-[10px] text-white/55">/ {f.minutes(status.plannedMin)}</div>
                  </div>
                </Ring>
              )}
            </div>

            <p className="mt-4 text-[15px] font-medium text-white/85">{statusText}</p>
            {activeCalc.segments.length > 0 && (activeCalc.kind === 'work' || activeCalc.kind === 'training') && (
              <Timeline className="mt-4" segments={activeCalc.segments} nowMin={activeCalc.date === today ? nowMin : null} colorClass={cn(barClass(activeCalc.type, activeCalc.kind), 'opacity-95')} />
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              {profile.clockEnabled && (
                <Button size="sm" variant={clockedIn ? 'primary' : 'secondary'} className={clockedIn ? '' : 'bg-white/10 text-white ring-white/20 hover:bg-white/15'} icon={clockedIn ? <LogOut className="size-4" /> : <LogIn className="size-4" />} onClick={clock}>
                  {clockedIn ? t.today.clockOut : t.today.clockIn}
                </Button>
              )}
              <Button size="sm" className="bg-white/10 text-white ring-white/20 hover:bg-white/15" icon={<PenLine className="size-4" />} onClick={() => openDay(today)}>
                {t.common.edit}
              </Button>
              {clockedIn && <span className="self-center text-[13px] text-white/60">{t.today.clockedSince(clockEntry!.clockIn!)}</span>}
            </div>
          </Card>

          {/* Week strip */}
          <Card className="p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-ink">{t.today.thisWeek}</h3>
              <span className="tabular text-[14px] font-semibold text-muted">{f.minutes(week.workedMin + week.creditedMin)} {t.common.h}</span>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {week.days.map((day) => {
                const isToday = day.date === today;
                return (
                  <button
                    key={day.date}
                    onClick={() => openDay(day.date)}
                    className={cn('flex flex-col items-center gap-1.5 rounded-2xl py-2.5 transition', isToday ? 'bg-brand-soft ring-1 ring-brand/30' : 'hover:bg-surface-2')}
                  >
                    <span className={cn('text-[11px] font-semibold uppercase', isToday ? 'text-brand' : 'text-muted')}>{t.weekdaysShort[weekdayIndex(day.date)]}</span>
                    <span className={cn('tabular text-[15px] font-bold', isToday ? 'text-brand' : day.holiday ? 'text-danger' : 'text-ink')}>{fromISO(day.date).getDate()}</span>
                    {day.entry ? <ShiftChip code={day.code} type={day.type} kind={day.kind} unknown={day.unknown} size="xs" className="max-w-[40px]" /> : <span className="h-[18px] text-faint">·</span>}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
              <div>
                <div className="text-[12px] font-medium text-muted">{t.hours.night}</div>
                <div className="tabular text-[17px] font-bold text-ink">{f.minutes(week.nightMin)}</div>
              </div>
              <div>
                <div className="text-[12px] font-medium text-muted">{t.hours.sunday}</div>
                <div className="tabular text-[17px] font-bold text-ink">{f.minutes(week.sundayMin)}</div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {hasAnything && monthSum.unknownCodes.length > 0 && (
        <button onClick={() => navigate('/types', { code: monthSum.unknownCodes[0] })} className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-warning/10 p-4 text-left ring-1 ring-warning/25 transition hover:bg-warning/15">
          <AlertTriangle className="size-5 shrink-0 text-warning" />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-ink">{t.today.unknownCodes(monthSum.unknownCodes.length)}: {monthSum.unknownCodes.slice(0, 4).join(', ')}</span>
            <span className="block text-[13px] text-muted">{t.today.unknownCodesHint}</span>
          </span>
          <ArrowRight className="size-4 text-muted" />
        </button>
      )}

      {hasAnything && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card className="col-span-2 flex items-center gap-4 p-4 sm:p-5">
              <Ring value={monthSum.targetMin ? (monthSum.workedMin + monthSum.creditedMin) / monthSum.targetMin : 0} size={64} stroke={7}>
                <CalendarDays className="size-5 text-brand" />
              </Ring>
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-muted">{t.today.thisMonth} · {f.dateCap(today, 'LLLL')}</div>
                <div className="tabular text-[26px] font-bold leading-tight tracking-[-0.03em] text-ink">{f.minutes(monthSum.workedMin + monthSum.creditedMin)} <span className="text-[15px] font-semibold text-muted">{t.common.h}</span></div>
                <div className="truncate text-[13px] text-muted">
                  {monthSum.targetMin ? t.today.target(f.minutes(monthSum.targetMin)) : t.common.days(monthSum.daysWorked)}
                </div>
              </div>
            </Card>
            <Stat label={t.today.nightHours} value={f.minutes(monthSum.nightMin)} icon={<Moon className="size-3.5" />} accent="bg-indigo-500/12 text-indigo-500" />
            <Stat label={t.today.sundayHours} value={f.minutes(monthSum.sundayMin)} icon={<Sun className="size-3.5" />} accent="bg-amber-500/12 text-amber-500" />
          </div>

          <button onClick={() => navigate(pay.configured ? '/earnings' : '/pay-setup')} className="mt-3 block w-full text-left">
            <Card className="flex items-center gap-4 p-4 transition hover:ring-line-strong sm:p-5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-500">
                <Wallet className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-muted">{t.today.estimate}</div>
                {payResult ? (
                  <div className="tabular text-[22px] font-bold tracking-[-0.03em] text-ink">{f.money(payResult.net)}</div>
                ) : (
                  <div className="text-[14.5px] font-medium text-ink-2">{t.today.estimateHint}</div>
                )}
              </div>
              {payResult && (
                <div className="text-right text-[12.5px] font-medium text-muted">{t.today.payday(Math.max(0, diffDays(today, paydayISO)))}</div>
              )}
              <ArrowRight className="size-4 shrink-0 text-faint" />
            </Card>
          </button>

          <SectionTitle action={<button onClick={() => navigate('/calendar')} className="text-[13px] font-semibold text-brand">{t.nav.calendar}</button>}>
            {t.today.upcoming}
          </SectionTitle>
          <Card className="overflow-hidden">
            {upcoming.length === 0 && <p className="px-5 py-6 text-[14px] text-muted">{t.today.noUpcoming}</p>}
            <div className="divide-y divide-line">
              {upcoming.map((day) => (
                <button key={day.date} onClick={() => openDay(day.date)} className="flex w-full items-center gap-3.5 px-4 py-3 text-left transition hover:bg-surface-2">
                  <div className="w-11 shrink-0 text-center">
                    <div className="text-[11px] font-semibold uppercase text-muted">{t.weekdaysShort[weekdayIndex(day.date)]}</div>
                    <div className={cn('tabular text-[18px] font-bold leading-tight', day.holiday ? 'text-danger' : 'text-ink')}>{fromISO(day.date).getDate()}</div>
                  </div>
                  <ShiftChip code={day.code} type={day.type} kind={day.kind} unknown={day.unknown} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-medium text-ink">{day.type?.name ?? (day.kind !== 'none' ? t.kinds[day.kind] : day.code)}</div>
                    <div className="tabular truncate text-[13px] text-muted">{day.segments.length && day.kind === 'work' ? fmtSegments(day.segments) : day.holiday ? t.holidays[day.holiday] ?? '' : ''}</div>
                  </div>
                  {day.workedMin > 0 && <div className="tabular text-[14px] font-semibold text-ink-2">{f.minutes(day.workedMin)}</div>}
                </button>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
