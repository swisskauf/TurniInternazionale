import { useId } from 'react';
import { cn } from '@/lib/cn';
import type { DayKind, ShiftType } from '@/engine/types';
import { COLOR_CLASSES, CUSTOM_CHIP, UNKNOWN_CHIP } from './ui/colors';

const KIND_FALLBACK: Record<DayKind, keyof typeof COLOR_CLASSES> = {
  work: 'blue', rest: 'slate', vacation: 'emerald', sick: 'orange', holiday: 'red', training: 'teal', other: 'slate',
};

export function chipClasses(type?: ShiftType, kind?: DayKind | 'none', unknown?: boolean): string {
  if (unknown) return UNKNOWN_CHIP;
  if (type) return COLOR_CLASSES[type.color].chip;
  if (kind && kind !== 'none' && kind !== 'work') return COLOR_CLASSES[KIND_FALLBACK[kind]].chip;
  return CUSTOM_CHIP;
}

export function solidClasses(type?: ShiftType, kind?: DayKind | 'none', unknown?: boolean): string {
  if (unknown) return 'bg-amber-500 text-white ring-white/20';
  if (type) return `${COLOR_CLASSES[type.color].solid} ring-white/20`;
  if (kind && kind !== 'none' && kind !== 'work') return `${COLOR_CLASSES[KIND_FALLBACK[kind]].solid} ring-white/20`;
  return 'bg-white/15 text-white ring-white/20';
}

export function dotClass(type?: ShiftType, kind?: DayKind | 'none'): string {
  if (type) return COLOR_CLASSES[type.color].dot;
  if (kind && kind !== 'none') return COLOR_CLASSES[KIND_FALLBACK[kind]].dot;
  return 'bg-faint';
}

export function barClass(type?: ShiftType, kind?: DayKind | 'none'): string {
  if (type) return COLOR_CLASSES[type.color].bar;
  if (kind && kind !== 'none' && kind !== 'work') return COLOR_CLASSES[KIND_FALLBACK[kind]].bar;
  return 'bg-ink-2';
}

export function colorHex(type?: ShiftType, kind?: DayKind | 'none'): string {
  if (type) return COLOR_CLASSES[type.color].hex;
  if (kind && kind !== 'none' && kind !== 'work') return COLOR_CLASSES[KIND_FALLBACK[kind]].hex;
  return '#64748b';
}

export function ShiftChip({
  code, type, kind, unknown, size = 'sm', className, title, solid,
}: {
  code: string;
  type?: ShiftType;
  kind?: DayKind | 'none';
  unknown?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  title?: string;
  solid?: boolean;
}) {
  const sizes = {
    xs: 'h-[18px] min-w-[18px] px-1 text-[10px] rounded-md',
    sm: 'h-6 min-w-6 px-1.5 text-[12px] rounded-lg',
    md: 'h-8 min-w-8 px-2.5 text-[14px] rounded-xl',
    lg: 'h-12 min-w-12 px-3.5 text-[20px] rounded-2xl',
  };
  return (
    <span
      title={title}
      className={cn(
        'inline-flex max-w-full shrink-0 items-center justify-center truncate font-bold tracking-[-0.01em] ring-1 ring-inset',
        sizes[size],
        solid ? solidClasses(type, kind, unknown) : chipClasses(type, kind, unknown),
        className,
      )}
    >
      <span className="truncate">{code || '•'}</span>
    </span>
  );
}

export function Logo({ size = 36, className }: { size?: number; className?: string }) {
  const id = `swsg${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff5a68" />
          <stop offset="1" stopColor="#d81b3c" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="17" fill={`url(#${id})`} />
      <path d="M32 14.5A17.5 17.5 0 1 1 16.84 23.25" fill="none" stroke="#fff" strokeWidth="4.9" strokeLinecap="round" />
      <path d="M20.28 17.29L20.91 25.59L12.78 20.91Z" fill="#fff" stroke="#fff" strokeWidth="2.1" strokeLinejoin="round" />
      <rect x="29" y="23" width="6" height="18" rx="1.5" fill="#fff" />
      <rect x="23" y="29" width="18" height="6" rx="1.5" fill="#fff" />
    </svg>
  );
}
