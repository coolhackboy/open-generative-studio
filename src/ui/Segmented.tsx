import { motion } from 'motion/react';
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from './cn';

export interface SegmentedOption<T> {
  value: T;
  label: ReactNode;
  /** Accessible text when `label` is not plain text. */
  title?: string;
}

/** Radio group with a sliding highlight. `layout="grid"` wraps many options. */
export function Segmented<T extends string | number | boolean | undefined>({
  options,
  value,
  onChange,
  label,
  layout = 'row',
  size = 'md',
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  layout?: 'row' | 'grid';
  size?: 'sm' | 'md';
  className?: string;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  const onKeyDown = (e: KeyboardEvent) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (index + delta + options.length) % options.length;
    onChange(options[next].value);
    requestAnimationFrame(() => ref.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus());
  };

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        'rounded-sm border border-line bg-bg-subtle p-0.5',
        layout === 'row' ? 'inline-flex' : 'grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-0.5',
        className,
      )}
    >
      {options.map((o, i) => {
        const selected = i === index && o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            title={o.title}
            tabIndex={selected || (index === i && !options.some((x) => x.value === value)) ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative inline-flex items-center justify-center gap-1.5 rounded-xs font-medium whitespace-nowrap transition-colors',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]',
              selected ? 'text-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            {selected && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-xs border border-line-strong bg-surface-3 shadow-sm"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative inline-flex items-center gap-1.5">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
