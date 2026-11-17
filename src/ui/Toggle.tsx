import { cn } from './cn';

export function Toggle({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-200',
        checked ? 'border-transparent bg-accent' : 'border-line-strong bg-surface-3',
        className,
      )}
    >
      <span
        className={cn(
          'block size-3.5 rounded-full shadow-sm transition-transform duration-200 ease-out-soft',
          checked ? 'translate-x-[18px] bg-accent-fg' : 'translate-x-[2px] bg-fg-muted',
        )}
      />
    </button>
  );
}
