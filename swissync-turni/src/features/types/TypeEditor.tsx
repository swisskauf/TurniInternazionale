import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/Button';
import { Field, Input, NumberInput, Select } from '@/components/ui/Form';
import { Sheet } from '@/components/ui/Sheet';
import { confirmDialog, toast } from '@/components/ui/Feedback';
import { ShiftChip } from '@/components/ShiftChip';
import { COLOR_CLASSES } from '@/components/ui/colors';
import { SegmentsEditor } from '@/features/day/DayEditor';
import { normalizeCode } from '@/engine/recognition/tokens';
import { isValidSegment, totalSegmentMinutes } from '@/engine/time';
import { DAY_KINDS, SHIFT_COLORS, type DayKind, type ShiftColor, type ShiftType } from '@/engine/types';
import { uid } from '@/lib/id';
import { useStore } from '@/store/store';
import { useT } from '@/i18n';
import { useFmt } from '@/lib/format';
import { cn } from '@/lib/cn';

const KIND_DEFAULT_COLOR: Partial<Record<DayKind, ShiftColor>> = { rest: 'slate', vacation: 'emerald', sick: 'orange', holiday: 'red', training: 'teal' };

export function blankType(code = ''): ShiftType {
  const now = Date.now();
  return { id: uid('t_'), code, name: '', kind: 'work', color: 'blue', segments: [{ start: '08:00', end: '17:00' }], unpaidBreakMin: 0, creditedHours: 0, aliases: [], source: 'manual', createdAt: now, updatedAt: now };
}

export function TypeEditor({ open, type, onClose, onSaved }: { open: boolean; type: ShiftType; onClose: () => void; onSaved?: (t: ShiftType) => void }) {
  const t = useT();
  const f = useFmt();
  const types = useStore((s) => s.types);
  const entries = useStore((s) => s.entries);
  const upsertType = useStore((s) => s.upsertType);
  const removeType = useStore((s) => s.removeType);
  const [draft, setDraft] = useState<ShiftType>(type);
  const [aliases, setAliases] = useState(type.aliases.join(', '));
  const isNew = !types[type.id];
  const used = useMemo(() => Object.values(entries).filter((e) => e.typeId === type.id).length, [entries, type.id]);
  const isWork = draft.kind === 'work' || draft.kind === 'training';
  const code = normalizeCode(draft.code);
  const duplicate = !!code && Object.values(types).some((x) => x.id !== draft.id && !x.archived && normalizeCode(x.code) === code);
  const segs = draft.segments.filter(isValidSegment);
  const valid = !!code && !duplicate && (!isWork || segs.length > 0);

  const set = (p: Partial<ShiftType>) => setDraft((d) => ({ ...d, ...p }));

  const save = () => {
    const saved: ShiftType = {
      ...draft,
      code,
      name: draft.name.trim() || code,
      segments: isWork ? segs : [],
      unpaidBreakMin: isWork ? draft.unpaidBreakMin : 0,
      aliases: aliases.split(',').map((a) => normalizeCode(a)).filter((a) => a && a !== code),
    };
    upsertType(saved);
    toast(t.toast.saved);
    onSaved?.(saved);
    onClose();
  };

  const remove = async () => {
    const ok = await confirmDialog({ title: t.common.delete, text: t.types.deleteConfirm, confirmLabel: t.common.delete, cancelLabel: t.common.cancel, danger: true });
    if (!ok) return;
    removeType(type.id);
    toast(t.toast.deleted);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isNew ? t.types.add : t.types.editor}
      subtitle={!isNew && used ? t.types.used(used) : undefined}
      closeLabel={t.common.close}
      footer={
        <div className="flex gap-2">
          {!isNew && (
            <IconButton label={t.common.delete} variant="secondary" onClick={remove}>
              <Trash2 className="size-4.5 text-danger" />
            </IconButton>
          )}
          <Button variant="primary" block disabled={!valid} onClick={save}>
            {t.common.save}
          </Button>
        </div>
      }
    >
      <div className="mb-5 flex items-center gap-4 rounded-2xl bg-surface-2 p-4 ring-1 ring-line">
        <ShiftChip code={code || '?'} type={{ ...draft, code }} size="lg" />
        <div className="min-w-0">
          <div className="truncate text-[17px] font-semibold text-ink">{draft.name || code || '—'}</div>
          <div className="tabular text-[13.5px] text-muted">
            {isWork ? `${f.minutes(Math.max(0, totalSegmentMinutes(segs) - draft.unpaidBreakMin))} ${t.common.h}` : t.kinds[draft.kind]}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_1.4fr] gap-3">
        <Field label={t.types.code}>
          <Input value={draft.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} placeholder="P1" maxLength={12} autoCapitalize="characters" className="font-bold" />
        </Field>
        <Field label={t.types.name}>
          <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder={t.kinds[draft.kind]} />
        </Field>
      </div>
      {duplicate && <p className="mt-1.5 text-[13px] font-medium text-danger">{t.types.duplicate}</p>}
      <p className="mt-1.5 px-0.5 text-[12.5px] text-muted">{t.types.codeHint}</p>

      <Field label={t.types.kind} className="mt-4">
        <Select
          value={draft.kind}
          onChange={(e) => {
            const kind = e.target.value as DayKind;
            set({ kind, color: draft.source === 'manual' && isNew ? KIND_DEFAULT_COLOR[kind] ?? (draft.color === 'slate' ? 'blue' : draft.color) : draft.color });
          }}
        >
          {DAY_KINDS.map((k) => <option key={k} value={k}>{t.kinds[k]}</option>)}
        </Select>
      </Field>

      {isWork ? (
        <>
          <Field label={t.day.segments} className="mt-4">
            <SegmentsEditor segments={draft.segments} onChange={(s) => set({ segments: s })} />
          </Field>
          <Field label={t.day.unpaidBreak} className="mt-3">
            <NumberInput value={draft.unpaidBreakMin} onChange={(v) => set({ unpaidBreakMin: Math.round(v) })} suffix={t.common.min} min={0} />
          </Field>
        </>
      ) : (
        <Field label={t.types.creditedHours} hint={t.types.creditedHoursHint} className="mt-4">
          <NumberInput value={draft.creditedHours} onChange={(v) => set({ creditedHours: v })} suffix={t.common.h} min={0} />
        </Field>
      )}

      <Field label={t.types.color} className="mt-4">
        <div className="flex flex-wrap gap-2">
          {SHIFT_COLORS.map((c) => (
            <button
              key={c}
              aria-label={c}
              onClick={() => set({ color: c })}
              className={cn('size-9 rounded-full ring-offset-2 ring-offset-surface transition', COLOR_CLASSES[c].dot, draft.color === c ? 'ring-2 ring-ink' : 'hover:scale-110')}
            />
          ))}
        </div>
      </Field>

      <Field label={t.types.aliases} hint={t.types.aliasesHint} className="mt-4">
        <Input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="PI, Pl" />
      </Field>
    </Sheet>
  );
}
