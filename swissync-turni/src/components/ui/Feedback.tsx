import { useEffect, type ReactNode } from 'react';
import { create } from 'zustand';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';
import { Sheet } from './Sheet';

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

type ToastKind = 'success' | 'error' | 'info' | 'warning';
interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
  action?: { label: string; run: () => void };
}

const useToasts = create<{ toasts: Toast[] }>(() => ({ toasts: [] }));
let nextId = 1;

export function toast(text: string, kind: ToastKind = 'success', action?: Toast['action']) {
  const id = nextId++;
  useToasts.setState((s) => ({ toasts: [...s.toasts.slice(-2), { id, kind, text, action }] }));
  setTimeout(() => useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), action ? 6000 : 3200);
}

const ICONS = {
  success: <CheckCircle2 className="size-5 text-success" />,
  error: <XCircle className="size-5 text-danger" />,
  info: <Info className="size-5 text-sky-500" />,
  warning: <AlertTriangle className="size-5 text-warning" />,
};

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+12px)]">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            className="glass pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl px-4 py-3 text-[14px] font-medium text-ink shadow-float ring-1 ring-line"
          >
            {ICONS[t.kind]}
            <span className="min-w-0 flex-1">{t.text}</span>
            {t.action && (
              <button
                className="shrink-0 rounded-lg px-2 py-1 text-[13px] font-semibold text-brand hover:bg-brand-soft"
                onClick={() => {
                  t.action!.run();
                  useToasts.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) }));
                }}
              >
                {t.action.label}
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirm dialog
// ---------------------------------------------------------------------------

interface ConfirmState {
  open: boolean;
  title: string;
  text?: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  resolve?: (v: boolean) => void;
}

const useConfirmStore = create<ConfirmState>(() => ({ open: false, title: '', confirmLabel: 'OK', cancelLabel: 'Annulla' }));

export function confirmDialog(opts: { title: string; text?: string; confirmLabel: string; cancelLabel: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => useConfirmStore.setState({ ...opts, open: true, resolve }));
}

export function ConfirmHost() {
  const s = useConfirmStore();
  const close = (v: boolean) => {
    s.resolve?.(v);
    useConfirmStore.setState({ open: false, resolve: undefined });
  };
  return (
    <Sheet open={s.open} onClose={() => close(false)} title={s.title} size="sm" closeLabel={s.cancelLabel}>
      {s.text && <p className="text-[15px] leading-relaxed text-ink-2">{s.text}</p>}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button onClick={() => close(false)}>{s.cancelLabel}</Button>
        <Button variant={s.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
          {s.confirmLabel}
        </Button>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-muted', className)} />;
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info'; className?: string }) {
  const tones = {
    neutral: 'bg-surface-3 text-ink-2',
    brand: 'bg-brand-soft text-brand',
    success: 'bg-success/12 text-success',
    warning: 'bg-warning/15 text-warning',
    danger: 'bg-danger/12 text-danger',
    info: 'bg-sky-500/12 text-sky-600 dark:text-sky-400',
  };
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold', tones[tone], className)}>{children}</span>;
}

export function EmptyState({ icon, title, text, action, className }: { icon?: ReactNode; title: ReactNode; text?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-10 text-center', className)}>
      {icon && <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-surface-3 text-muted">{icon}</div>}
      <h3 className="text-[17px] font-semibold text-ink">{title}</h3>
      {text && <p className="mt-1.5 max-w-sm text-[14px] leading-relaxed text-muted text-balance">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ProgressBar({ value, className, tone = 'brand' }: { value: number; className?: string; tone?: 'brand' | 'ink' }) {
  return (
    <div className={cn('h-2 overflow-hidden rounded-full bg-surface-3', className)}>
      <div
        className={cn('h-full rounded-full transition-[width] duration-500', tone === 'brand' ? 'brand-gradient' : 'bg-ink')}
        style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }}
      />
    </div>
  );
}

export function Ring({ value, size = 64, stroke = 7, children, color = 'var(--brand)', track = 'var(--surface-3)' }: { value: number; size?: number; stroke?: number; children?: ReactNode; color?: string; track?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

/** Calls `fn` every `ms` while mounted (used for live clocks). */
export function useInterval(fn: () => void, ms: number) {
  useEffect(() => {
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  }, [fn, ms]);
}
