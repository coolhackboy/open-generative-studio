import type { ReactNode } from 'react';
import { cn } from './cn';

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-line bg-surface-2 px-1',
        'font-mono text-xs font-medium text-fg-muted',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
