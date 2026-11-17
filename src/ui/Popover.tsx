import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';
import { focusables, useEscapeLayer } from './layers';

export interface PopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  side?: 'top' | 'bottom';
  align?: 'start' | 'center' | 'end';
  /** Accessible name of the popover panel. */
  label: string;
  className?: string;
  children: ReactNode;
}

const GAP = 8;
const MARGIN = 8;

/**
 * Anchored floating panel rendered in a portal with viewport clamping, so it never
 * overflows on narrow screens. Closes on outside click and Esc (via the layer stack).
 */
export function Popover({
  open,
  onClose,
  anchorRef,
  side = 'top',
  align = 'start',
  label,
  className,
  children,
}: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; side: 'top' | 'bottom' } | null>(null);

  const close = useCallback(
    (restore: boolean) => {
      onClose();
      if (restore) anchorRef.current?.focus({ preventScroll: true });
    },
    [onClose, anchorRef],
  );

  useEscapeLayer(open, () => close(true));

  const place = useCallback(() => {
    const a = anchorRef.current?.getBoundingClientRect();
    const p = panelRef.current;
    if (!a || !p) return;
    const w = p.offsetWidth;
    const h = p.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = align === 'start' ? a.left : align === 'end' ? a.right - w : a.left + a.width / 2 - w / 2;
    left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN));
    let s = side;
    if (s === 'top' && a.top - GAP - h < MARGIN && vh - a.bottom > a.top) s = 'bottom';
    if (s === 'bottom' && a.bottom + GAP + h > vh - MARGIN && a.top > vh - a.bottom) s = 'top';
    const top = s === 'top' ? Math.max(MARGIN, a.top - GAP - h) : Math.min(vh - h - MARGIN, a.bottom + GAP);
    setPos({ left, top, side: s });
  }, [anchorRef, side, align]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    place();
    const panel = panelRef.current;
    const ro = new ResizeObserver(place);
    if (panel) ro.observe(panel);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      close(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    const raf = requestAnimationFrame(() => {
      const p = panelRef.current;
      if (!p) return;
      const target =
        p.querySelector<HTMLElement>('[data-autofocus]') ??
        p.querySelector<HTMLElement>('[aria-checked="true"]') ??
        focusables(p)[0];
      target?.focus({ preventScroll: true });
    });
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      cancelAnimationFrame(raf);
    };
  }, [open, close, anchorRef]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-label={label}
          initial={{ opacity: 0, y: (pos?.side ?? side) === 'top' ? 6 : -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
          transition={{ type: 'spring', stiffness: 500, damping: 34 }}
          style={{
            left: pos?.left ?? -9999,
            top: pos?.top ?? -9999,
            transformOrigin: (pos?.side ?? side) === 'top' ? 'bottom' : 'top',
          }}
          className={cn(
            'fixed z-[60] max-w-[calc(100vw-16px)] rounded-md border border-line-strong bg-surface p-3 shadow-lg',
            className,
          )}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
