import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from './cn';

const KEYFRAMES: Keyframe[] = [
  { transform: 'translateX(0)' },
  { transform: 'translateX(-5px)' },
  { transform: 'translateX(5px)' },
  { transform: 'translateX(-4px)' },
  { transform: 'translateX(3px)' },
  { transform: 'translateX(0)' },
];

/**
 * Wraps a control that failed validation: plays a 320ms shake whenever `nonce` changes while
 * `active`, and shows a red outline until the problem is fixed. Respects reduced motion.
 */
export function Shake({
  active,
  nonce,
  children,
  className,
  block,
}: {
  active: boolean;
  nonce?: number;
  children: ReactNode;
  className?: string;
  block?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!active || !ref.current) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    ref.current.animate?.(KEYFRAMES, { duration: 320, easing: 'cubic-bezier(0.36, 0.07, 0.19, 0.97)' });
  }, [active, nonce]);
  return (
    <span
      ref={ref}
      data-invalid={active || undefined}
      className={cn(
        block ? 'block' : 'inline-flex shrink-0',
        'rounded-sm transition-shadow duration-200',
        active && 'shadow-[0_0_0_1.5px_var(--danger)]',
        className,
      )}
    >
      {children}
    </span>
  );
}
