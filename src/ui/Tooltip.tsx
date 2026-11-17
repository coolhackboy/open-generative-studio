import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';

const MARGIN = 8;
const GAP = 6;
const DELAY = 350;

/**
 * Tooltip rendered in a portal and clamped to the viewport, so it never causes horizontal
 * scroll or gets clipped by scrolling containers. Shows on hover (after a short delay) and
 * immediately on keyboard focus.
 */
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
  const id = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const show = useCallback((immediate: boolean) => {
    clearTimeout(timer.current);
    if (immediate) setOpen(true);
    else timer.current = setTimeout(() => setOpen(true), DELAY);
  }, []);
  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setOpen(false);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const a = anchorRef.current?.getBoundingClientRect();
    const t = tipRef.current;
    if (!a || !t) return;
    const w = t.offsetWidth;
    const h = t.offsetHeight;
    let left = a.left + a.width / 2 - w / 2;
    left = Math.max(MARGIN, Math.min(left, window.innerWidth - w - MARGIN));
    let top = side === 'bottom' ? a.bottom + GAP : a.top - GAP - h;
    if (top < MARGIN) top = a.bottom + GAP;
    if (top + h > window.innerHeight - MARGIN) top = a.top - GAP - h;
    setPos({ left, top });
  }, [open, side, label]);

  useEffect(() => {
    if (!open) return;
    const close = () => hide();
    window.addEventListener('scroll', close, true);
    window.addEventListener('pointerdown', close, true);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('pointerdown', close, true);
    };
  }, [open, hide]);

  return (
    <span
      ref={anchorRef}
      className={cn('inline-flex', className)}
      aria-describedby={open ? id : undefined}
      onPointerEnter={(e) => e.pointerType === 'mouse' && show(false)}
      onPointerLeave={hide}
      onFocus={(e) => {
        if ((e.target as HTMLElement).matches(':focus-visible')) show(true);
      }}
      onBlur={hide}
    >
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.span
                ref={tipRef}
                id={id}
                role="tooltip"
                initial={{ opacity: 0, y: side === 'bottom' ? -2 : 2 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.08 } }}
                transition={{ duration: 0.12 }}
                style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
                className="pointer-events-none fixed z-[100] max-w-[min(320px,calc(100vw-16px))] rounded-xs bg-fg px-2 py-1 text-xs font-medium text-bg shadow-md"
              >
                {label}
              </motion.span>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </span>
  );
}
