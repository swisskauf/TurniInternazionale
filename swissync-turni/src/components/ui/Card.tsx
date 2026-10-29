import type { HTMLAttributes, ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-[var(--radius-card)] bg-surface shadow-card ring-1 ring-line', className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-2.5 mt-7 flex items-end justify-between gap-3 px-1', className)}>
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted">{children}</h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow, onBack }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode; onBack?: () => void }) {
  return (
    <header className="mb-5 flex items-start justify-between gap-4 px-1 pt-2">
      <div className="min-w-0">
        {onBack && (
          <button onClick={onBack} className="-ml-2 mb-2 flex items-center gap-0.5 rounded-full py-1 pl-1 pr-3 text-[14px] font-semibold text-brand hover:bg-brand-soft lg:hidden" aria-label="back">
            <ChevronLeft className="size-5" />
          </button>
        )}
        {eyebrow && <div className="mb-1 text-[13px] font-medium text-muted">{eyebrow}</div>}
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em] text-ink sm:text-[32px]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-xl text-[15px] leading-snug text-muted text-balance">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </header>
  );
}

export function ListRow({
  icon, title, subtitle, right, onClick, chevron = !!onClick, className, danger,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
  className?: string;
  danger?: boolean;
}) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition',
        onClick && 'hover:bg-surface-2 active:bg-surface-3',
        className,
      )}
    >
      {icon && <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-ink-2', danger && 'bg-danger/10 text-danger')}>{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-[15px] font-medium text-ink', danger && 'text-danger')}>{title}</span>
        {subtitle && <span className="mt-0.5 block text-[13px] leading-snug text-muted">{subtitle}</span>}
      </span>
      {right}
      {chevron && <ChevronRight className="size-4 shrink-0 text-faint" />}
    </Comp>
  );
}

export function Divided({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('divide-y divide-line overflow-hidden', className)}>{children}</div>;
}

export function Stat({
  label, value, sub, icon, accent, className,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  accent?: string;
  className?: string;
}) {
  return (
    <Card className={cn('p-4', className)}>
      <div className="flex items-center gap-2 text-[13px] font-medium text-muted">
        {icon && <span className={cn('flex size-6 items-center justify-center rounded-lg', accent ?? 'bg-surface-3 text-ink-2')}>{icon}</span>}
        <span className="truncate">{label}</span>
      </div>
      <div className="tabular mt-2 text-[24px] font-bold leading-none tracking-[-0.03em] text-ink">{value}</div>
      {sub && <div className="mt-1.5 truncate text-[12.5px] text-muted">{sub}</div>}
    </Card>
  );
}
