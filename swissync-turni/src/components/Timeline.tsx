import { toAbsoluteIntervals } from '@/engine/time';
import type { Segment } from '@/engine/types';
import { cn } from '@/lib/cn';

/**
 * A 24h track with the shift segments drawn on it and a "now" marker.
 * Overnight segments wrap past the right edge and continue on a second lane.
 */
export function Timeline({ segments, nowMin, className, colorClass = 'bg-white', trackClass = 'bg-white/12', labels = true, labelClass = 'text-white/45' }: {
  segments: Segment[];
  nowMin?: number | null;
  className?: string;
  colorClass?: string;
  trackClass?: string;
  labels?: boolean;
  labelClass?: string;
}) {
  const iv = toAbsoluteIntervals(segments);
  const pieces: { a: number; b: number }[] = [];
  for (const [s, e] of iv) {
    for (let d = Math.floor(s / 1440) * 1440; d < e; d += 1440) {
      const a = Math.max(s, d) - d;
      const b = Math.min(e, d + 1440) - d;
      if (b > a) pieces.push({ a, b });
    }
  }
  return (
    <div className={cn('w-full', className)}>
      <div className={cn('relative h-2.5 w-full overflow-hidden rounded-full', trackClass)}>
        {pieces.map((p, i) => (
          <div key={i} className={cn('absolute inset-y-0 rounded-full', colorClass)} style={{ left: `${(p.a / 1440) * 100}%`, width: `${((p.b - p.a) / 1440) * 100}%` }} />
        ))}
        {nowMin != null && (
          <div className="absolute -inset-y-1 w-[3px] -translate-x-1/2 rounded-full bg-brand shadow-[0_0_0_3px_rgba(255,61,85,0.25)]" style={{ left: `${(nowMin / 1440) * 100}%` }} />
        )}
      </div>
      {labels && (
        <div className={cn('tabular mt-1.5 flex justify-between text-[10.5px] font-medium', labelClass)}>
          <span>00</span>
          <span>06</span>
          <span>12</span>
          <span>18</span>
          <span>24</span>
        </div>
      )}
    </div>
  );
}
