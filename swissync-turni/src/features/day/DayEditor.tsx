import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { AlertTriangle, CalendarPlus, Plus, Trash2, X } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/Button';
import { Field, NumberInput, Segmented, Switch, Textarea, TimeInput, Input } from '@/components/ui/Form';
import { Sheet } from '@/components/ui/Sheet';
import { Badge, toast } from '@/components/ui/Feedback';
import { ShiftChip } from '@/components/ShiftChip';
import { computeDay } from '@/engine/hours';
import { fmtSegments, isValidSegment, totalSegmentMinutes } from '@/engine/time';
import type { DayKind, ISODate, Segment, ShiftEntry } from '@/engine/types';
import { activeTypes, useStore } from '@/store/store';
import { useCalcOptions } from '@/app/hooks';
import { navigate } from '@/app/router';
import { useT } from '@/i18n';
import { useFmt } from '@/lib/format';
import { buildIcs } from '@/lib/ics';
import { saveFile } from '@/lib/files';
import { cn } from '@/lib/cn';

export const useDayEditor = create<{ date: ISODate | null; open: (d: ISODate) => void; close: () => void }>((set) => ({
  date: null,
  open: (date) => set({ date }),
  close: () => set({ date: null }),
}));

type Choice = { mode: 'none' } | { mode: 'type'; typeId: string } | { mode: 'custom' };

export function SegmentsEditor({ segments, onChange }: { segments: Segment[]; onChange: (s: Segment[]) => void }) {
  const t = useT();
  return (
    <div className="space-y-2">
      {segments.map((seg, i) => (
        <div key={i} className="flex items-center gap-2">
          <TimeInput ariaLabel={t.common.from} value={seg.start} onChange={(v) => onChange(segments.map((s, j) => (j === i ? { ...s, start: v } : s)))} />
          <span className="text-muted">–</span>
          <TimeInput ariaLabel={t.common.to} value={seg.end} onChange={(v) => onChange(segments.map((s, j) => (j === i ? { ...s, end: v } : s)))} />
          <IconButton label={t.common.delete} size="sm" onClick={() => onChange(segments.filter((_, j) => j !== i))} disabled={segments.length === 1}>
            <X className="size-4" />
          </IconButton>
        </div>
      ))}
      <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => onChange([...segments, { start: segments.at(-1)?.end ?? '08:00', end: '' }])}>
        {t.day.addSegment}
      </Button>
    </div>
  );
}

export function DayEditorHost() {
  const date = useDayEditor((s) => s.date);
  const close = useDayEditor((s) => s.close);
  return date ? <DayEditor key={date} date={date} onClose={close} /> : null;
}

function DayEditor({ date, onClose }: { date: ISODate; onClose: () => void }) {
  const t = useT();
  const f = useFmt();
  const entry = useStore((s) => s.entries[date]);
  const types = useStore((s) => s.types);
  const setEntry = useStore((s) => s.setEntry);
  const opts = useCalcOptions();
  const list = useMemo(() => activeTypes(types), [types]);
  const [open, setOpen] = useState(true);

  const initial: Choice = entry?.typeId && types[entry.typeId] ? { mode: 'type', typeId: entry.typeId } : entry ? { mode: 'custom' } : { mode: 'none' };
  const [choice, setChoice] = useState<Choice>(initial);
  const [override, setOverride] = useState(!!(entry?.typeId && entry.segments?.length));
  const [segments, setSegments] = useState<Segment[]>(entry?.segments?.length ? entry.segments : entry?.typeId && types[entry.typeId]?.segments.length ? types[entry.typeId].segments : [{ start: '08:00', end: '17:00' }]);
  const [unpaid, setUnpaid] = useState(entry?.unpaidBreakMin ?? (entry?.typeId ? types[entry.typeId]?.unpaidBreakMin ?? 0 : 0));
  const [kind, setKind] = useState<DayKind>(entry?.kind ?? 'work');
  const [label, setLabel] = useState(entry && !entry.typeId ? entry.code : '');
  const [note, setNote] = useState(entry?.note ?? '');

  const type = choice.mode === 'type' ? types[choice.typeId] : undefined;
  useEffect(() => {
    if (type && !override) {
      setSegments(type.segments.length ? type.segments : [{ start: '08:00', end: '17:00' }]);
      setUnpaid(type.unpaidBreakMin);
    }
  }, [type, override]);

  const draft: ShiftEntry | null = useMemo(() => {
    if (choice.mode === 'none') return null;
    const valid = segments.filter(isValidSegment);
    if (choice.mode === 'type' && type) {
      return {
        date,
        typeId: type.id,
        code: type.code,
        segments: override && valid.length ? valid : undefined,
        unpaidBreakMin: override ? unpaid : undefined,
        note: note.trim() || undefined,
        origin: entry?.origin ?? 'manual',
        manual: true,
        updatedAt: Date.now(),
      };
    }
    const isWork = kind === 'work' || kind === 'training';
    return {
      date,
      code: label.trim().toUpperCase() || (isWork && valid.length ? fmtSegments(valid) : t.kinds[kind]),
      kind,
      segments: isWork && valid.length ? valid : undefined,
      unpaidBreakMin: isWork ? unpaid : undefined,
      note: note.trim() || undefined,
      origin: entry?.origin ?? 'manual',
      manual: true,
      updatedAt: Date.now(),
    };
  }, [choice, type, override, segments, unpaid, kind, label, note, date, entry, t]);

  const calc = useMemo(() => computeDay(date, draft ?? undefined, types, opts), [date, draft, types, opts]);
  const holiday = opts.holidayOf(date);
  const unknownCode = entry && !entry.typeId && !entry.kind && !entry.segments?.length ? entry.code : '';

  const finish = () => setOpen(false);
  const save = () => {
    setEntry(date, draft);
    toast(draft ? t.day.saved : t.day.removed);
    finish();
  };

  const exportIcs = async () => {
    const ics = buildIcs([calc], (d) => (d.type ? `${d.type.code} · ${d.type.name}` : d.code));
    await saveFile(new Blob([ics], { type: 'text/calendar' }), `turno-${date}.ics`, { share: true });
  };

  return (
    <>
    <ExitWatcher open={open} onExited={onClose} />
    <Sheet
      open={open}
      onClose={finish}
      title={f.dateCap(date, 'EEEE d MMMM')}
      subtitle={holiday ? <Badge tone="danger">{holiday.startsWith('custom:') ? holiday.slice(7) : t.holidays[holiday] ?? t.calendar.holiday}</Badge> : entry?.changedFrom ? t.calendar.changed(entry.changedFrom) : undefined}
      closeLabel={t.common.close}
      footer={
        <div className="flex items-center gap-2">
          {entry && (
            <IconButton label={t.common.delete} variant="secondary" onClick={() => { setEntry(date, null); toast(t.day.removed); finish(); }}>
              <Trash2 className="size-4.5 text-danger" />
            </IconButton>
          )}
          {calc.segments.length > 0 && (calc.kind === 'work' || calc.kind === 'training') && (
            <IconButton label={t.day.addToCalendar} variant="secondary" onClick={exportIcs}>
              <CalendarPlus className="size-4.5" />
            </IconButton>
          )}
          <Button variant="primary" block onClick={save}>
            {t.common.save}
          </Button>
        </div>
      }
    >
      {unknownCode && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl bg-warning/10 p-3.5 text-[14px] text-ink-2 ring-1 ring-warning/25">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            {t.day.unknownCode(unknownCode)}
            <button className="mt-1 block font-semibold text-brand" onClick={() => { finish(); navigate('/types', { code: unknownCode }); }}>
              {t.day.defineCode} →
            </button>
          </div>
        </div>
      )}

      <Field label={t.day.pickType}>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
          {list.map((ty) => {
            const selected = choice.mode === 'type' && choice.typeId === ty.id;
            return (
              <button
                key={ty.id}
                onClick={() => {
                  setOverride(false);
                  setChoice({ mode: 'type', typeId: ty.id });
                }}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-2xl p-2 text-center transition',
                  selected ? 'bg-surface-3 ring-2 ring-brand' : 'bg-surface-2 ring-1 ring-line hover:bg-surface-3',
                )}
              >
                <ShiftChip code={ty.code} type={ty} size="md" />
                <span className="w-full truncate text-[11px] font-medium text-muted">{ty.name}</span>
              </button>
            );
          })}
          <button
            onClick={() => setChoice({ mode: 'custom' })}
            className={cn('flex flex-col items-center justify-center gap-1 rounded-2xl p-2 text-center transition', choice.mode === 'custom' ? 'bg-surface-3 ring-2 ring-brand' : 'bg-surface-2 ring-1 ring-line hover:bg-surface-3')}
          >
            <span className="flex h-8 items-center text-[18px] font-bold text-ink-2">+</span>
            <span className="w-full truncate text-[11px] font-medium text-muted">{t.day.customShift}</span>
          </button>
          <button
            onClick={() => setChoice({ mode: 'none' })}
            className={cn('flex flex-col items-center justify-center gap-1 rounded-2xl p-2 text-center transition', choice.mode === 'none' ? 'bg-surface-3 ring-2 ring-brand' : 'bg-surface-2 ring-1 ring-line hover:bg-surface-3')}
          >
            <span className="flex h-8 items-center text-[18px] font-bold text-faint">∅</span>
            <span className="w-full truncate text-[11px] font-medium text-muted">{t.day.noShift}</span>
          </button>
        </div>
      </Field>

      {choice.mode === 'type' && type && (
        <div className="mt-5 space-y-4">
          <div className="rounded-2xl bg-surface-2 p-3.5 ring-1 ring-line">
            <div className="text-[13px] font-medium text-muted">{t.kinds[type.kind]}</div>
            <div className="tabular mt-0.5 text-[16px] font-semibold text-ink">{type.segments.length ? fmtSegments(type.segments) : '—'}</div>
          </div>
          {(type.kind === 'work' || type.kind === 'training') && (
            <Switch checked={override} onChange={setOverride} label={t.day.actualTimes} hint={t.day.actualTimesHint} />
          )}
          {override && (
            <>
              <Field label={t.day.segments}>
                <SegmentsEditor segments={segments} onChange={setSegments} />
              </Field>
              <Field label={t.day.unpaidBreak}>
                <NumberInput value={unpaid} onChange={setUnpaid} suffix={t.common.min} min={0} />
              </Field>
            </>
          )}
        </div>
      )}

      {choice.mode === 'custom' && (
        <div className="mt-5 space-y-4">
          <Field label={t.day.kind}>
            <Segmented
              size="sm"
              value={kind}
              onChange={setKind}
              options={(['work', 'rest', 'vacation', 'sick', 'other'] as DayKind[]).map((k) => ({ value: k, label: t.kinds[k] }))}
              className="overflow-x-auto no-scrollbar"
            />
          </Field>
          {(kind === 'work' || kind === 'training') && (
            <>
              <Field label={t.day.segments}>
                <SegmentsEditor segments={segments} onChange={setSegments} />
              </Field>
              <Field label={t.day.unpaidBreak}>
                <NumberInput value={unpaid} onChange={setUnpaid} suffix={t.common.min} min={0} />
              </Field>
            </>
          )}
          <Field label={t.day.planCode} hint={t.common.optional}>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Es. CORSO" maxLength={16} />
          </Field>
        </div>
      )}

      {choice.mode !== 'none' && (
        <Field label={t.common.note} className="mt-4">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.day.notePlaceholder} rows={2} className="min-h-20" />
        </Field>
      )}

      {draft && (calc.kind === 'work' || calc.kind === 'training') && (
        <div className="mt-5 grid grid-cols-3 gap-2">
          <MiniStat label={t.day.worked} value={f.minutes(calc.workedMin)} strong />
          <MiniStat label={t.day.night} value={f.minutes(calc.nightMin, { zero: '—' })} />
          <MiniStat label={t.day.breaks} value={calc.breakMin ? `${calc.breakMin} ${t.common.min}` : '—'} />
        </div>
      )}
      {draft && totalSegmentMinutes(segments) === 0 && (choice.mode === 'custom' && (kind === 'work')) && (
        <p className="mt-3 text-[13px] text-warning">{t.day.segments}: —</p>
      )}
    </Sheet>
    </>
  );
}

function MiniStat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn('rounded-2xl p-3 ring-1 ring-line', strong ? 'bg-brand-soft' : 'bg-surface-2')}>
      <div className="truncate text-[11.5px] font-medium text-muted">{label}</div>
      <div className={cn('tabular mt-0.5 text-[17px] font-bold', strong ? 'text-brand' : 'text-ink')}>{value}</div>
    </div>
  );
}

/** Waits for the sheet's exit animation before unmounting the host. */
function ExitWatcher({ open, onExited }: { open: boolean; onExited: () => void }) {
  useEffect(() => {
    if (open) return;
    const id = setTimeout(onExited, 280);
    return () => clearTimeout(id);
  }, [open, onExited]);
  return null;
}
