import type { ComponentProps, ReactNode } from 'react';
import { useId } from 'react';
import { cn } from './cn';

export function Input({ className, ...rest }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-9 w-full rounded-sm border border-line-strong bg-bg-subtle px-3 text-sm text-fg placeholder:text-fg-subtle',
        'transition-colors outline-none focus:border-accent focus-visible:outline-none focus:ring-2 focus:ring-[var(--ring)]/40',
        className,
      )}
      {...rest}
    />
  );
}

/** Label + control + hint, wired with ids for accessibility. */
export function Field({
  label,
  hint,
  children,
  action,
}: {
  label: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  children: (id: string, hintId?: string) => ReactNode;
}) {
  const id = useId();
  const hintId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-medium text-fg">
          {label}
        </label>
        {action}
      </div>
      {children(id, hint ? hintId : undefined)}
      {hint && (
        <p id={hintId} className="text-xs leading-5 text-fg-subtle">
          {hint}
        </p>
      )}
    </div>
  );
}
