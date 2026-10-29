import { useMemo } from 'react';
import { ShiftChip } from '@/components/ShiftChip';
import type { ShiftType } from '@/engine/types';
import { activeTypes, useStore } from '@/store/store';
import { fmtSegments } from '@/engine/time';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';

/** Grid of the user's shift types; `null` = "no shift". */
export function TypePicker({ onPick, allowNone, selectedId }: { onPick: (t: ShiftType | null) => void; allowNone?: boolean; selectedId?: string }) {
  const t = useT();
  const types = useStore((s) => s.types);
  const list = useMemo(() => activeTypes(types), [types]);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {list.map((ty) => (
        <button
          key={ty.id}
          onClick={() => onPick(ty)}
          className={cn('flex items-center gap-2.5 rounded-2xl p-2.5 text-left ring-1 transition', selectedId === ty.id ? 'bg-surface-3 ring-2 ring-brand' : 'bg-surface-2 ring-line hover:bg-surface-3')}
        >
          <ShiftChip code={ty.code} type={ty} size="md" />
          <span className="min-w-0">
            <span className="block truncate text-[13.5px] font-semibold text-ink">{ty.name}</span>
            <span className="tabular block truncate text-[11.5px] text-muted">{ty.segments.length ? fmtSegments(ty.segments) : t.kinds[ty.kind]}</span>
          </span>
        </button>
      ))}
      {allowNone && (
        <button onClick={() => onPick(null)} className="flex items-center gap-2.5 rounded-2xl bg-surface-2 p-2.5 text-left ring-1 ring-line hover:bg-surface-3">
          <span className="flex size-8 items-center justify-center rounded-xl bg-surface-3 text-[16px] font-bold text-faint">∅</span>
          <span className="text-[13.5px] font-semibold text-ink-2">{t.day.noShift}</span>
        </button>
      )}
    </div>
  );
}
