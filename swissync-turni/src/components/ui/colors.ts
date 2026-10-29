import type { ShiftColor } from '@/engine/types';

interface ColorClasses {
  chip: string;
  dot: string;
  solid: string;
  soft: string;
  text: string;
  bar: string;
  hex: string;
}

// Literal class names so Tailwind can see them.
export const COLOR_CLASSES: Record<ShiftColor, ColorClasses> = {
  red: { chip: 'bg-red-500/15 text-red-700 ring-red-500/25 dark:text-red-300', dot: 'bg-red-500', solid: 'bg-red-500 text-white', soft: 'bg-red-500/10', text: 'text-red-600 dark:text-red-400', bar: 'bg-red-500', hex: '#ef4444' },
  orange: { chip: 'bg-orange-500/15 text-orange-700 ring-orange-500/25 dark:text-orange-300', dot: 'bg-orange-500', solid: 'bg-orange-500 text-white', soft: 'bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400', bar: 'bg-orange-500', hex: '#f97316' },
  amber: { chip: 'bg-amber-500/15 text-amber-700 ring-amber-500/25 dark:text-amber-300', dot: 'bg-amber-500', solid: 'bg-amber-500 text-white', soft: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', bar: 'bg-amber-500', hex: '#f59e0b' },
  lime: { chip: 'bg-lime-500/15 text-lime-700 ring-lime-500/25 dark:text-lime-300', dot: 'bg-lime-500', solid: 'bg-lime-500 text-white', soft: 'bg-lime-500/10', text: 'text-lime-600 dark:text-lime-400', bar: 'bg-lime-500', hex: '#84cc16' },
  emerald: { chip: 'bg-emerald-500/15 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300', dot: 'bg-emerald-500', solid: 'bg-emerald-500 text-white', soft: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500', hex: '#10b981' },
  teal: { chip: 'bg-teal-500/15 text-teal-700 ring-teal-500/25 dark:text-teal-300', dot: 'bg-teal-500', solid: 'bg-teal-500 text-white', soft: 'bg-teal-500/10', text: 'text-teal-600 dark:text-teal-400', bar: 'bg-teal-500', hex: '#14b8a6' },
  sky: { chip: 'bg-sky-500/15 text-sky-700 ring-sky-500/25 dark:text-sky-300', dot: 'bg-sky-500', solid: 'bg-sky-500 text-white', soft: 'bg-sky-500/10', text: 'text-sky-600 dark:text-sky-400', bar: 'bg-sky-500', hex: '#0ea5e9' },
  blue: { chip: 'bg-blue-500/15 text-blue-700 ring-blue-500/25 dark:text-blue-300', dot: 'bg-blue-500', solid: 'bg-blue-500 text-white', soft: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', bar: 'bg-blue-500', hex: '#3b82f6' },
  indigo: { chip: 'bg-indigo-500/15 text-indigo-700 ring-indigo-500/25 dark:text-indigo-300', dot: 'bg-indigo-500', solid: 'bg-indigo-500 text-white', soft: 'bg-indigo-500/10', text: 'text-indigo-600 dark:text-indigo-400', bar: 'bg-indigo-500', hex: '#6366f1' },
  violet: { chip: 'bg-violet-500/15 text-violet-700 ring-violet-500/25 dark:text-violet-300', dot: 'bg-violet-500', solid: 'bg-violet-500 text-white', soft: 'bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400', bar: 'bg-violet-500', hex: '#8b5cf6' },
  fuchsia: { chip: 'bg-fuchsia-500/15 text-fuchsia-700 ring-fuchsia-500/25 dark:text-fuchsia-300', dot: 'bg-fuchsia-500', solid: 'bg-fuchsia-500 text-white', soft: 'bg-fuchsia-500/10', text: 'text-fuchsia-600 dark:text-fuchsia-400', bar: 'bg-fuchsia-500', hex: '#d946ef' },
  slate: { chip: 'bg-slate-500/15 text-slate-700 ring-slate-500/25 dark:text-slate-300', dot: 'bg-slate-400', solid: 'bg-slate-500 text-white', soft: 'bg-slate-500/10', text: 'text-slate-600 dark:text-slate-400', bar: 'bg-slate-400', hex: '#94a3b8' },
};

export const UNKNOWN_CHIP = 'bg-amber-400/15 text-amber-700 ring-amber-500/40 dark:text-amber-300';
export const CUSTOM_CHIP = 'bg-surface-3 text-ink-2 ring-line-strong';
