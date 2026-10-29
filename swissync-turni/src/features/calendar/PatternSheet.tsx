import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Switch } from '@/components/ui/Form';
import { Sheet } from '@/components/ui/Sheet';
import { toast } from '@/components/ui/Feedback';
import { ShiftChip } from '@/components/ShiftChip';
import { addDays, eachDay } from '@/engine/dates';
import type { ISODate, ShiftEntry, ShiftType } from '@/engine/types';
import { useStore } from '@/store/store';
import { useT } from '@/i18n';
import { TypePicker } from './TypePicker';

export function PatternSheet({ open, onClose, startDate }: { open: boolean; onClose: () => void; startDate: ISODate }) {
  const t = useT();
  const entries = useStore((s) => s.entries);
  const setEntries = useStore((s) => s.setEntries);
  const undoLast = useStore((s) => s.undoLast);
  const [sequence, setSequence] = useState<(ShiftType | null)[]>([]);
  const [picking, setPicking] = useState(false);
  const [start, setStart] = useState(startDate);
  const [end, setEnd] = useState(addDays(startDate, 27));
  const [skipManual, setSkipManual] = useState(true);

  const days = useMemo(() => (sequence.length && start <= end ? eachDay(start, end) : []), [sequence.length, start, end]);
  const apply = () => {
    const map: Record<ISODate, ShiftEntry | null> = {};
    let n = 0;
    days.forEach((d, i) => {
      if (skipManual && entries[d]?.manual) return;
      const ty = sequence[i % sequence.length];
      map[d] = ty ? { date: d, typeId: ty.id, code: ty.code, origin: 'pattern', updatedAt: Date.now() } : null;
      n++;
    });
    setEntries(map, t.pattern.title);
    toast(t.pattern.applied(n), 'success', { label: t.common.undo, run: () => undoLast() });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t.pattern.title}
      subtitle={t.pattern.hint}
      closeLabel={t.common.close}
      footer={
        <Button variant="primary" block disabled={!days.length} onClick={apply}>
          {t.pattern.apply}
        </Button>
      }
    >
      <Field label={t.pattern.sequence}>
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface-2 p-3 ring-1 ring-line">
          {sequence.map((ty, i) => (
            <button key={i} onClick={() => setSequence(sequence.filter((_, j) => j !== i))} className="group relative" title={t.common.delete}>
              {ty ? <ShiftChip code={ty.code} type={ty} size="md" /> : <span className="flex h-8 min-w-8 items-center justify-center rounded-xl bg-surface-3 px-2 text-[13px] font-bold text-faint ring-1 ring-inset ring-line">∅</span>}
              <span className="absolute -right-1.5 -top-1.5 hidden size-4 items-center justify-center rounded-full bg-ink text-bg group-hover:flex"><X className="size-3" /></span>
            </button>
          ))}
          <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => setPicking((p) => !p)}>
            {t.pattern.addStep}
          </Button>
        </div>
      </Field>
      {picking && (
        <div className="mt-3">
          <TypePicker allowNone onPick={(ty) => setSequence([...sequence, ty])} />
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label={t.pattern.startDate}>
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label={t.pattern.repeatUntil}>
          <Input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <div className="mt-4">
        <Switch checked={skipManual} onChange={setSkipManual} label={t.pattern.skipManual} />
      </div>
      {days.length > 0 && <p className="mt-4 text-[14px] font-medium text-muted">{t.pattern.preview(days.length)}</p>}
    </Sheet>
  );
}
