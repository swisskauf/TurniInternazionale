import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'soft' | 'danger' | 'ink';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'brand-gradient text-white shadow-[0_8px_20px_-8px_rgba(229,34,63,0.6)] hover:brightness-105 active:brightness-95',
  secondary: 'bg-surface text-ink ring-1 ring-inset ring-line-strong hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-surface-3/70',
  soft: 'bg-brand-soft text-brand hover:brightness-95',
  danger: 'bg-danger/10 text-danger hover:bg-danger/15',
  ink: 'bg-ink text-bg hover:opacity-90',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-[13px] gap-1.5 rounded-xl',
  md: 'h-11 px-4.5 text-[15px] gap-2 rounded-2xl',
  lg: 'h-13 px-6 text-base gap-2.5 rounded-2xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, iconRight, loading, block, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center font-semibold tracking-[-0.01em] transition duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-[1.1em] animate-spin" /> : icon}
      {children}
      {iconRight}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: 'ghost' | 'secondary' | 'soft' | 'glass';
  size?: 'sm' | 'md';
}

export function IconButton({ label, variant = 'ghost', size = 'md', className, children, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-40',
        size === 'md' ? 'size-10' : 'size-8',
        variant === 'ghost' && 'text-ink-2 hover:bg-surface-3/80',
        variant === 'secondary' && 'bg-surface text-ink ring-1 ring-inset ring-line-strong hover:bg-surface-2',
        variant === 'soft' && 'bg-brand-soft text-brand',
        variant === 'glass' && 'glass text-ink ring-1 ring-inset ring-line',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
