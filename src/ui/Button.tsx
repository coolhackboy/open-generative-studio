import type { ComponentProps, ReactNode } from 'react';
import { cn } from './cn';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
type Size = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]',
  secondary: 'bg-surface-2 text-fg hover:bg-surface-3 border border-line',
  ghost: 'text-fg-muted hover:text-fg hover:bg-surface-2',
  outline: 'border border-line-strong text-fg hover:bg-surface-2',
  danger: 'bg-danger-soft text-danger hover:bg-danger hover:text-white',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-sm',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-sm',
  lg: 'h-11 px-5 text-[15px] gap-2 rounded-md',
  icon: 'size-9 rounded-sm',
  'icon-sm': 'size-8 rounded-sm',
};

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap select-none',
        'transition-[background-color,color,box-shadow,transform,opacity] duration-150 active:scale-[0.97]',
        'disabled:opacity-50 disabled:active:scale-100',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={size === 'lg' ? 18 : 15} /> : icon}
      {children}
    </button>
  );
}
