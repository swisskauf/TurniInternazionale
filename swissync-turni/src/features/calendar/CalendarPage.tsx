import { useMemo, useState } from 'react';
import { CalendarPlus, CheckSquare, ChevronLeft, ChevronRight, Eraser, Layers, Repeat, StickyNote, X } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, PageHeader } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Form';
import { Sheet } from '@/components/ui/Sheet';
import { EmptyState, toast } from '@/components/ui/Feedback';
import { ShiftChip, dotClass } from '@/components/ShiftChip';
import { useDayEditor } from '@/features/day/DayEditor';
import { useSummary, useToday } from '@/app/hooks';
import { navigate, useRoute } from '@/app/router';
import { fromISO, isoWeek, monthGrid, monthRange, weekdayIndex } from '@/engine/dates';
import { fmtSegments } from '@/engine/time';
import type { ISODate, ShiftEntry } from '@/engine/types';
import { useStore } from '@/store/store';
import { useT } from '@/i18n';
import { useFmt } from '@/lib/format';
import { buildIcs } from '@/lib/ics';
import { saveFile } from '@/lib/files';
import { cn } from '@/lib/cn';
import { PatternSheet } from './PatternSheet';
import { TypePicker } from './TypePicker';
import type { DayCalc } from '@/engine/hours';

export function CalendarPage() {
  const t = useT();
  const f = useFmt();
  const today = useToday();
  const { params } = useRoute();
  const initial = params.get('month') ?? today.slice(0, 7);
  const [ym, setYm] = useState(initial);
  const [view, setView] = useState<'month' | 'list'>('month');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<ISODate>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [patternOpen, setPatternOpen] = useState(false);
  const openDay = useDayEditor((s) => s.open);
  const setEntries = useStore((s) => s.setEntries);
  const undoLast = useStore((s) => s.undoLast);
  const types = useStore((s) => s.types);

  const [y, m] = ym.split('-').map(Number);
  const range = monthRange(y, m);
  const grid = useMemo(() => monthGrid(y, m), [y, m]);
  const gridSummary = useSummary(grid[0][0], grid[grid.length - 1][6]);
  const monthSum = useSummary(range.start, range.end);
  const byDate = useMemo(() => Object.fromEntries(gridSummary.days.map((d) => [d.date, d])), [gridSummary]);

  const shift = (n: number) => {
    const d = new Date(y, m - 1 + n, 1);
    setYm(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const toggle = (d: ISODate) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(d)) n.delete(d);
      else n.add(d);
      return n;
    });
  };

  const onDay = (d: ISODate) => (selecting ? toggle(d) : openDay(d));

  const applyBulk = (typeId: string | null) => {
    const map: Record<ISODate, ShiftEntry | null> = {};
    for (const d of selected) {
      const ty = typeId ? types[typeId] : null;
      map[d] = ty ? { date: d, typeId: ty.id, code: ty.code, origin: 'manual', manual: true, updatedAt: Date.now() } : null;
    }
    setEntries(map, t.calendar.applyToSelected);
    toast(t.common.selected(selected.size), 'success', { label: t.common.undo, run: () => undoLast() });
    setSelected(new Set());
    setSelecting(false);
    setBulkOpen(false);
  };

  const exportIcs = async () => {
    const ics = buildIcs(monthSum.days, (d) => (d.type ? `${d.type.code} · ${d.type.name}` : d.code));
    await saveFile(new Blob([ics], { type: 'text/calendar' }), `turni-${ym}.ics`, { share: true });
  };

  const usedTypes = Object.entries(monthSum.typeCounts)
    .map(([id, n]) => ({ type: types[id], n }))
    .filter((x) => x.type)
    .sort((a, b) => b.n - a.n);

  return (
    <div>
      <PageHeader
        title={f.dateCap(range.start, 'LLLL yyyy')}
        eyebrow={t.calendar.title}
        actions={
          <>
            <IconButton label={t.common.back} variant="secondary" onClick={() => shift(-1)}><ChevronLeft className="size-5" /></IconButton>
            <IconButton label={t.common.next} variant="secondary" onClick={() => shift(1)}><ChevronRight className="size-5" /></IconButton>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={view} onChange={setView} options={[{ value: 'month', label: t.calendar.month }, { value: 'list', label: t.calendar.list }]} className="w-48" size="sm" />
        {ym !== today.slice(0, 7) && <Button size="sm" variant="secondary" onClick={() => setYm(today.slice(0, 7))}>{t.common.today}</Button>}
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant={selecting ? 'ink' : 'secondary'} icon={<CheckSquare className="size-4" />} onClick={() => { setSelecting(!selecting); setSelected(new Set()); }}>
            <span className="hidden sm:inline">{t.calendar.selectMode}</span>
          </Button>
          <IconButton label={t.calendar.pattern} variant="secondary" size="md" onClick={() => setPatternOpen(true)}><Repeat className="size-4.5" /></IconButton>
          <IconButton label={t.calendar.exportIcs} variant="secondary" size="md" onClick={exportIcs}><CalendarPlus className="size-4.5" /></IconButton>
        </div>
      </div>

      {view === 'month' ? (
        <Card className="overflow-hidden p-2 sm:p-3">
          <div className="grid grid-cols-7 pb-1.5">
            {t.weekdaysShort.map((w, i) => (
              <div key={w} className={cn('py-1 text-center text-[11.5px] font-semibold uppercase tracking-wide', i === 6 ? 'text-brand/80' : 'text-muted')}>{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {grid.flat().map((d) => (
              <DayCell key={d} day={byDate[d]} inMonth={d.slice(0, 7) === ym} isToday={d === today} selected={selected.has(d)} selecting={selecting} onClick={() => onDay(d)} />
            ))}
          </div>
        </Card>
      ) : (
        <ListView days={monthSum.days} onDay={onDay} selected={selected} today={today} />
      )}

      {/* Month summary */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label={t.calendar.monthTotal} value={`${f.minutes(monthSum.workedMin + monthSum.creditedMin)} ${t.common.h}`} strong onClick={() => navigate('/hours', { month: ym })} />
        <SummaryTile label={t.hours.days} value={String(monthSum.daysWorked)} />
        <SummaryTile label={t.hours.night} value={f.minutes(monthSum.nightMin)} />
        <SummaryTile label={t.hours.sunday} value={f.minutes(monthSum.sundayMin)} />
      </div>

      {usedTypes.length > 0 && (
        <Card className="mt-3 p-4">
          <div className="flex flex-wrap gap-x-4 gap-y-2.5">
            {usedTypes.map(({ type, n }) => (
              <div key={type.id} className="flex items-center gap-2">
                <ShiftChip code={type.code} type={type} />
                <span className="text-[13px] text-muted">× {n}</span>
              </div>
            ))}
            <button onClick={() => navigate('/types')} className="ml-auto flex items-center gap-1.5 text-[13px] font-semibold text-brand"><Layers className="size-4" />{t.nav.types}</button>
          </div>
        </Card>
      )}
      {monthSum.plannedDays === 0 && (
        <p className="mt-6 text-center text-[14px] text-muted">{t.calendar.tapToAdd}</p>
      )}

      {/* Bulk action bar */}
      {selecting && (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+92px)] z-40 flex justify-center px-4 lg:bottom-8">
          <div className="glass flex items-center gap-2 rounded-2xl p-2 shadow-float ring-1 ring-line">
            <span className="px-2 text-[14px] font-semibold text-ink">{t.common.selected(selected.size)}</span>
            <Button size="sm" variant="primary" disabled={!selected.size} onClick={() => setBulkOpen(true)}>{t.common.apply}</Button>
            <IconButton label={t.calendar.clearDays} disabled={!selected.size} onClick={() => applyBulk(null)}><Eraser className="size-4.5" /></IconButton>
            <IconButton label={t.common.close} onClick={() => { setSelecting(false); setSelected(new Set()); }}><X className="size-4.5" /></IconButton>
          </div>
        </div>
      )}

      <Sheet open={bulkOpen} onClose={() => setBulkOpen(false)} title={t.calendar.applyToSelected} subtitle={t.common.selected(selected.size)} closeLabel={t.common.close}>
        <TypePicker allowNone onPick={(ty) => applyBulk(ty?.id ?? null)} />
      </Sheet>
      {patternOpen && <PatternSheet open={patternOpen} onClose={() => setPatternOpen(false)} startDate={range.start < today && today <= range.end ? today : range.start} />}
    </div>
  );
}

function DayCell({ day, inMonth, isToday, selected, selecting, onClick }: { day?: DayCalc; inMonth: boolean; isToday: boolean; selected: boolean; selecting: boolean; onClick: () => void }) {
  const f = useFmt();
  if (!day) return <div />;
  const date = fromISO(day.date);
  const sunday = weekdayIndex(day.date) === 6;
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex aspect-[0.78] flex-col items-center rounded-xl pt-1.5 transition sm:aspect-[1.05] sm:rounded-2xl sm:pt-2',
        inMonth ? 'bg-surface-2/70 hover:bg-surface-3' : 'opacity-35 hover:opacity-60',
        isToday && 'bg-brand-soft ring-2 ring-brand/70',
        selected && 'bg-brand-soft ring-2 ring-brand',
        selecting && !selected && 'ring-1 ring-line-strong',
      )}
    >
      <span className={cn('tabular text-[12.5px] font-semibold sm:text-[13.5px]', isToday ? 'text-brand' : day.holiday || sunday ? 'text-danger' : 'text-ink-2')}>{date.getDate()}</span>
      <span className="mt-auto mb-auto flex w-full justify-center px-0.5">
        {day.entry && <ShiftChip code={day.code} type={day.type} kind={day.kind} unknown={day.unknown} size="xs" className="max-w-full sm:h-6 sm:min-w-6 sm:px-1.5 sm:text-[12px]" />}
      </span>
      {day.workedMin > 0 && <span className="tabular mb-1.5 hidden text-[11px] font-medium text-muted sm:block">{f.minutes(day.workedMin)}</span>}
      <span className="absolute right-1 top-1 flex gap-0.5">
        {day.entry?.changedFrom && <span className="size-1.5 rounded-full bg-amber-500" />}
        {day.entry?.manual && <span className="size-1.5 rounded-full bg-sky-500" />}
        {day.entry?.note && <StickyNote className="size-2.5 text-muted" />}
      </span>
      {day.holiday && <span className={cn('absolute bottom-1 left-1/2 h-0.5 w-3 -translate-x-1/2 rounded-full bg-danger/70 sm:hidden')} />}
    </button>
  );
}

function ListView({ days, onDay, selected, today }: { days: DayCalc[]; onDay: (d: ISODate) => void; selected: Set<ISODate>; today: ISODate }) {
  const t = useT();
  const f = useFmt();
  const weeks = useMemo(() => {
    const out: { week: number; days: DayCalc[]; min: number }[] = [];
    for (const d of days) {
      const w = isoWeek(d.date).week;
      let cur = out[out.length - 1];
      if (!cur || cur.week !== w) out.push((cur = { week: w, days: [], min: 0 }));
      cur.days.push(d);
      cur.min += d.workedMin + d.creditedMin;
    }
    return out;
  }, [days]);
  if (!days.some((d) => d.entry)) return <Card><EmptyState title={t.calendar.emptyMonth} text={t.calendar.tapToAdd} /></Card>;
  return (
    <div className="space-y-3">
      {weeks.map((w) => (
        <Card key={w.week} className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line bg-surface-2/60 px-4 py-2 text-[12.5px] font-semibold text-muted">
            <span>{t.calendar.weekTotal(w.week)}</span>
            <span className="tabular">{f.minutes(w.min)} {t.common.h}</span>
          </div>
          <div className="divide-y divide-line">
            {w.days.map((d) => (
              <button key={d.date} onClick={() => onDay(d.date)} className={cn('flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-surface-2', selected.has(d.date) && 'bg-brand-soft', d.date === today && 'bg-brand-soft/60')}>
                <div className="w-14 shrink-0">
                  <div className={cn('text-[13px] font-semibold', d.holiday || weekdayIndex(d.date) === 6 ? 'text-danger' : 'text-ink')}>{t.weekdaysShort[weekdayIndex(d.date)]} {fromISO(d.date).getDate()}</div>
                </div>
                {d.entry ? <ShiftChip code={d.code} type={d.type} kind={d.kind} unknown={d.unknown} /> : <span className="w-6 text-center text-faint">·</span>}
                <div className="min-w-0 flex-1">
                  <div className="tabular truncate text-[13.5px] text-ink-2">
                    {d.entry ? (d.segments.length && (d.kind === 'work' || d.kind === 'training') ? fmtSegments(d.segments) : d.type?.name ?? (d.kind !== 'none' ? t.kinds[d.kind] : '')) : ''}
                  </div>
                  {(d.entry?.note || d.entry?.changedFrom) && (
                    <div className="truncate text-[12px] text-muted">{d.entry?.changedFrom ? t.calendar.changed(d.entry.changedFrom) : ''} {d.entry?.note ?? ''}</div>
                  )}
                </div>
                {d.workedMin > 0 && <span className="tabular text-[13.5px] font-semibold text-ink">{f.minutes(d.workedMin)}</span>}
                {d.entry && !d.workedMin && <span className={cn('size-2 rounded-full', dotClass(d.type, d.kind))} />}
              </button>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function SummaryTile({ label, value, strong, onClick }: { label: string; value: string; strong?: boolean; onClick?: () => void }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp onClick={onClick} className={cn('rounded-2xl p-3.5 text-left ring-1 ring-line transition', strong ? 'bg-ink text-bg ring-0 hover:opacity-90' : 'bg-surface shadow-card')}>
      <div className={cn('truncate text-[12px] font-medium', strong ? 'text-bg/70' : 'text-muted')}>{label}</div>
      <div className={cn('tabular mt-0.5 text-[20px] font-bold tracking-[-0.02em]', strong ? 'text-bg' : 'text-ink')}>{value}</div>
    </Comp>
  );
}
