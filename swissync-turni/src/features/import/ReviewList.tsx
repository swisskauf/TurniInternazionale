import { ArrowRight, Palette } from 'lucide-react';
import { Badge } from '@/components/ui/Feedback';
import { ShiftChip } from '@/components/ShiftChip';
import type { RecognizedDay } from '@/engine/recognition/run';
import type { ShiftEntry, ShiftType } from '@/engine/types';
import { useT } from '@/i18n';
import { useFmt } from '@/lib/format';
import { cn } from '@/lib/cn';

export interface ReviewDay extends RecognizedDay {
  include: boolean;
}

export type ReviewStatus = 'new' | 'changed' | 'same' | 'manual';

export function reviewStatus(d: ReviewDay, existing?: ShiftEntry): ReviewStatus {
  if (!existing) return 'new';
  if (existing.manual) return 'manual';
  const same = existing.code === d.code && existing.typeId === d.typeId && JSON.stringify(existing.segments ?? []) === JSON.stringify(d.segments ?? []);
  return same ? 'same' : 'changed';
}

export function ReviewList({ days, types, entries, onTap, onToggle }: {
  days: ReviewDay[];
  types: Record<string, ShiftType>;
  entries: Record<string, ShiftEntry>;
  onTap: (d: ReviewDay) => void;
  onToggle: (d: ReviewDay) => void;
}) {
  const t = useT();
  const f = useFmt();
  const statusLabel: Record<ReviewStatus, string> = { new: t.import.statusNew, changed: t.import.statusChanged, same: t.import.statusSame, manual: t.import.statusManual };
  const statusTone: Record<ReviewStatus, 'success' | 'warning' | 'neutral' | 'info'> = { new: 'success', changed: 'warning', same: 'neutral', manual: 'info' };
  return (
    <div className="divide-y divide-line">
      {days.map((d) => {
        const existing = entries[d.date];
        const st = reviewStatus(d, existing);
        const type = d.typeId ? types[d.typeId] : undefined;
        return (
          <div key={d.date} data-date={d.date} data-code={d.code} data-status={d.status} className={cn('flex items-center gap-3 px-4 py-2.5', !d.include && 'opacity-45')}>
            <input type="checkbox" checked={d.include} onChange={() => onToggle(d)} className="size-5 shrink-0 accent-[var(--brand)]" aria-label={d.date} />
            <button onClick={() => onTap(d)} className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden text-left">
              <span className="w-[84px] shrink-0 text-[13.5px] font-semibold text-ink">{f.dateCap(d.date, 'EEE d MMM')}</span>
              <span className="hidden w-24 shrink-0 truncate font-mono text-[12px] text-muted sm:block">
                {d.byColor && !d.raw ? <span className="inline-flex items-center gap-1 font-sans"><Palette className="size-3.5" />{t.import.byColor}</span> : d.raw || '∅'}
              </span>
              <ArrowRight className="hidden size-3.5 shrink-0 text-faint sm:block" />
              <ShiftChip code={d.code} type={type} kind={d.kind} unknown={d.status === 'unknown'} />
              <span className="min-w-0 flex-1 truncate text-[13px] text-muted">
                {st === 'changed' && existing ? `${existing.code} → ${d.code}` : type?.name ?? ''}
              </span>
            </button>
            <div className="flex shrink-0 items-center gap-1">
              {d.status === 'unknown' && <Badge tone="warning">{t.import.statusUnknown}</Badge>}
              {d.status === 'fuzzy' && <Badge tone="info">{t.import.statusFuzzy}</Badge>}
              {d.status !== 'unknown' && <Badge tone={statusTone[st]}>{statusLabel[st]}</Badge>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
