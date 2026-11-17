import type { ReactNode } from 'react';
import { cn } from './cn';

/** CSS-only tooltip. Shows on hover and on keyboard focus within its child. */
export function Tooltip({
  label,
  children,
  side = 'bottom',
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom';
  className?: string;
}) {
  return (
    <span className={cn('group/tt relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 rounded-xs bg-fg px-2 py-1',
          'text-2xs font-medium whitespace-nowrap text-bg opacity-0 shadow-md',
          'transition-opacity duration-150 group-hover/tt:opacity-100 group-hover/tt:delay-300',
          'group-has-[:focus-visible]/tt:opacity-100',
          side === 'bottom' ? 'top-[calc(100%+6px)]' : 'bottom-[calc(100%+6px)]',
        )}
      >
        {label}
      </span>
    </span>
  );
}
