import type { ComponentProps, ReactNode } from 'react';
import { cn } from './cn';

/** Compact pill button used for filters and parameter triggers. */
export function Chip({
  active,
  icon,
  label,
  value,
  className,
  children,
  type = 'button',
  ...rest
}: Omit<ComponentProps<'button'>, 'value'> & {
  active?: boolean;
  icon?: ReactNode;
  label?: ReactNode;
  value?: ReactNode;
}) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm border px-2.5 text-[13px] whitespace-nowrap',
        'transition-colors duration-150',
        active
          ? 'border-line-strong bg-surface-3 text-fg'
          : 'border-line bg-transparent text-fg-muted hover:border-line-strong hover:bg-surface-2 hover:text-fg',
        className,
      )}
      {...rest}
    >
      {icon}
      {label != null && <span className={cn(value != null && 'text-fg-subtle')}>{label}</span>}
      {value != null && <span className="font-medium text-fg">{value}</span>}
      {children}
    </button>
  );
}
