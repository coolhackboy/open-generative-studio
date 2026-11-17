import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from './cn';
import { focusables, useEscapeLayer } from './layers';

type Size = 'sm' | 'md' | 'lg' | 'xl' | 'full';

const sizes: Record<Size, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-[960px]',
  full: 'sm:max-w-[min(1400px,calc(100vw-48px))] sm:h-[calc(100dvh-48px)]',
};

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** Visually hide the header (title is still announced). */
  hideHeader?: boolean;
  size?: Size;
  /** Position on small screens: bottom sheet (default) or full screen. */
  mobile?: 'sheet' | 'full';
  className?: string;
  children: ReactNode;
}

let openCount = 0;

/** Accessible modal: portal, focus trap, Esc layer, scroll lock, restore focus. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  hideHeader,
  size = 'md',
  mobile = 'sheet',
  className,
  children,
}: DialogProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEscapeLayer(open, onClose);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    openCount++;
    document.documentElement.style.overflow = 'hidden';
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const visible = (el: HTMLElement) => el.getClientRects().length > 0;
      const target =
        Array.from(panel.querySelectorAll<HTMLElement>('[data-autofocus]')).find(visible) ??
        focusables(panel)[0] ??
        panel;
      target.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(raf);
      openCount--;
      if (openCount === 0) document.documentElement.style.overflow = '';
      restoreRef.current?.focus?.({ preventScroll: true });
    };
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    // Robust trap: move focus ourselves so nothing (e.g. scroll containers Chrome makes
    // focusable) can let it escape the dialog.
    const els = focusables(panelRef.current);
    e.preventDefault();
    if (els.length === 0) return panelRef.current.focus();
    const idx = els.indexOf(document.activeElement as HTMLElement);
    const next =
      idx === -1 ? (e.shiftKey ? els.length - 1 : 0) : (idx + (e.shiftKey ? -1 : 1) + els.length) % els.length;
    els[next].focus();
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-overlay backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description && !hideHeader ? descId : undefined}
            tabIndex={-1}
            onKeyDown={onKeyDown}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.8 }}
            className={cn(
              'relative flex w-full flex-col overflow-hidden border border-line-strong bg-surface shadow-lg outline-none',
              mobile === 'full' ? cn('h-dvh', size !== 'full' && !className?.includes('sm:h-') && 'sm:h-auto') : 'max-h-[92dvh] rounded-t-lg',
              'sm:max-h-[calc(100dvh-48px)] sm:rounded-lg',
              sizes[size],
              className,
            )}
          >
            {hideHeader ? (
              <h2 id={titleId} className="sr-only">
                {title}
              </h2>
            ) : (
              <div className="flex items-start gap-4 px-5 pt-5 pb-3">
                <div className="min-w-0 flex-1">
                  <h2 id={titleId} className="text-[15px] leading-6 font-semibold tracking-[-0.01em] text-fg">
                    {title}
                  </h2>
                  {description && (
                    <p id={descId} className="mt-1 text-[13px] leading-5 text-fg-muted">
                      {description}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="-mt-1 -mr-1 inline-flex size-9 items-center justify-center rounded-sm text-fg-muted hover:bg-surface-2 hover:text-fg"
                >
                  <X size={16} />
                </button>
              </div>
            )}
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
