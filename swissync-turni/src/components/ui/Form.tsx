import { useEffect, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { normalizeHM } from '@/engine/time';

export function Field({ label, hint, children, className, htmlFor, right }: { label?: ReactNode; hint?: ReactNode; children: ReactNode; className?: string; htmlFor?: string; right?: ReactNode }) {
  return (
    <div className={cn('block', className)}>
      {(label || right) && (
        <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
          {label && <label htmlFor={htmlFor} className="text-[13px] font-semibold text-ink-2">{label}</label>}
          {right}
        </div>
      )}
      {children}
      {hint && <p className="mt-1.5 px-0.5 text-[12.5px] leading-snug text-muted">{hint}</p>}
    </div>
  );
}

const inputBase =
  'w-full rounded-2xl bg-surface-2 px-3.5 text-[15px] text-ink ring-1 ring-inset ring-line placeholder:text-faint transition focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand/60 disabled:opacity-50';

export function Input({ className, suffix, prefix, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> & { suffix?: ReactNode; prefix?: ReactNode }) {
  if (suffix || prefix) {
    return (
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] text-muted">{prefix}</span>}
        <input className={cn(inputBase, 'h-12', prefix ? 'pl-11' : '', suffix ? 'pr-14' : '', className)} {...rest} />
        {suffix && <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[14px] font-medium text-muted">{suffix}</span>}
      </div>
    );
  }
  return <input className={cn(inputBase, 'h-12', className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputBase, 'min-h-28 py-3 leading-relaxed', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(inputBase, 'h-12 appearance-none pr-10', className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
    </div>
  );
}

/** Numeric input that accepts both comma and dot, committing a number on blur. */
export function NumberInput({
  value, onChange, suffix, prefix, step = 'any', min, className, placeholder, id,
}: {
  value: number;
  onChange: (v: number) => void;
  suffix?: ReactNode;
  prefix?: ReactNode;
  step?: string;
  min?: number;
  className?: string;
  placeholder?: string;
  id?: string;
}) {
  // With a placeholder, 0 is shown as empty so the hint is visible.
  const show = (v: number) => (!Number.isFinite(v) || (v === 0 && placeholder) ? '' : String(v));
  const [text, setText] = useState(() => show(value));
  useEffect(() => {
    setText((t) => (t.trim() !== '' && Number(t.replace(',', '.')) === value ? t : show(value)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Input
      id={id}
      inputMode="decimal"
      value={text}
      step={step}
      min={min}
      placeholder={placeholder}
      suffix={suffix}
      prefix={prefix}
      className={cn('tabular', className)}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d.,-]/g, '');
        setText(t);
        const n = Number(t.replace(',', '.'));
        if (t.trim() !== '' && Number.isFinite(n)) onChange(min != null ? Math.max(min, n) : n);
        else if (t.trim() === '') onChange(0);
      }}
      onBlur={() => setText(show(value))}
    />
  );
}

/** Time field: native time picker on touch devices, tolerant text field elsewhere ("8", "0830", "8.30"). */
export function TimeInput({ value, onChange, className, ariaLabel }: { value: string; onChange: (v: string) => void; className?: string; ariaLabel?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  if (coarse) {
    return (
      <input
        type="time"
        aria-label={ariaLabel}
        value={value === '24:00' ? '00:00' : value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputBase, 'tabular h-12 text-center', className)}
      />
    );
  }
  return (
    <input
      aria-label={ariaLabel}
      inputMode="numeric"
      placeholder="hh:mm"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const n = normalizeHM(text);
        setText(n || '');
        onChange(n);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className={cn(inputBase, 'tabular h-12 text-center', className)}
    />
  );
}

export function Switch({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn('flex cursor-pointer items-center gap-3', disabled && 'pointer-events-none opacity-50')}>
      {(label || hint) && (
        <span className="min-w-0 flex-1">
          {label && <span className="block text-[15px] font-medium text-ink">{label}</span>}
          {hint && <span className="mt-0.5 block text-[13px] leading-snug text-muted">{hint}</span>}
        </span>
      )}
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn('relative h-7 w-12 shrink-0 rounded-full transition-colors', checked ? 'bg-brand' : 'bg-surface-3 ring-1 ring-inset ring-line-strong')}
      >
        <span className={cn('absolute left-0 top-0.5 size-6 rounded-full bg-white shadow-sm transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
      </button>
    </label>
  );
}

export function Segmented<T extends string>({
  value, onChange, options, className, size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; icon?: ReactNode }[];
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="tablist" className={cn('flex rounded-2xl bg-surface-3/80 p-1 ring-1 ring-inset ring-line', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl font-semibold transition',
            size === 'md' ? 'h-9 px-3 text-[14px]' : 'h-8 px-2.5 text-[13px]',
            o.value === value ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Checkbox({ checked, onChange, label, className }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; className?: string }) {
  return (
    <label className={cn('flex cursor-pointer items-center gap-3 text-[15px] text-ink', className)}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5 shrink-0 rounded-md accent-[var(--brand)]" />
      {label}
    </label>
  );
}
