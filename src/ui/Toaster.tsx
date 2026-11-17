import { AnimatePresence, motion } from 'motion/react';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from './cn';
import { useToasts, type ToastItem, type ToastTone } from './toast';

/** Dismisses after `ms` of visible time; the countdown pauses while the stack is hovered or focused. */
function useAutoDismiss(item: ToastItem, paused: boolean, dismiss: (id: number) => void) {
  const remaining = useRef(item.ms);
  useEffect(() => {
    if (paused || item.ms <= 0) return;
    const start = Date.now();
    const t = setTimeout(() => dismiss(item.id), remaining.current);
    return () => {
      clearTimeout(t);
      remaining.current = Math.max(800, remaining.current - (Date.now() - start));
    };
  }, [paused, item.id, item.ms, dismiss]);
}

function AutoDismiss({ item, paused, dismiss }: { item: ToastItem; paused: boolean; dismiss: (id: number) => void }) {
  useAutoDismiss(item, paused, dismiss);
  return null;
}

const icons: Record<ToastTone, ReactNode> = {
  info: <Info size={16} className="text-fg-muted" />,
  success: <CircleCheck size={16} className="text-accent-ink" />,
  danger: <CircleAlert size={16} className="text-danger" />,
};

/** Mount once near the root. Toasts appear top-center so they never collide with bottom UI. */
export function Toaster() {
  const items = useToasts((s) => s.items);
  const dismiss = useToasts((s) => s.dismiss);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const paused = hover || focus;
  return (
    <div
      aria-live="polite"
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex flex-col items-center gap-2 px-4"
    >
      <AnimatePresence initial={false}>
        {items.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 480, damping: 36 }}
            role={t.tone === 'danger' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-md border bg-surface px-3.5 py-3 shadow-lg',
              t.tone === 'danger' ? 'border-danger/30' : 'border-line-strong',
            )}
          >
            <AutoDismiss item={t} paused={paused} dismiss={dismiss} />
            <span className="mt-0.5">{icons[t.tone]}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-fg">{t.title}</div>
              {t.description && <div className="mt-0.5 text-xs leading-5 text-fg-muted">{t.description}</div>}
              {t.action && (
                <button
                  type="button"
                  className="mt-1.5 text-xs font-medium text-accent-ink hover:underline"
                  onClick={() => {
                    t.action?.onClick();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
              className="-mt-0.5 -mr-1 rounded-xs p-1 text-fg-subtle hover:text-fg"
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
