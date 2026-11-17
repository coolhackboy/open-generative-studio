import { AnimatePresence, motion } from 'motion/react';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './cn';
import { useToasts, type ToastTone } from './toast';

const icons: Record<ToastTone, ReactNode> = {
  info: <Info size={16} className="text-fg-muted" />,
  success: <CircleCheck size={16} className="text-accent" />,
  danger: <CircleAlert size={16} className="text-danger" />,
};

/** Mount once near the root. Toasts appear top-center so they never collide with bottom UI. */
export function Toaster() {
  const items = useToasts((s) => s.items);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div
      aria-live="polite"
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
            <span className="mt-0.5">{icons[t.tone]}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-fg">{t.title}</div>
              {t.description && <div className="mt-0.5 text-xs leading-5 text-fg-muted">{t.description}</div>}
              {t.action && (
                <button
                  type="button"
                  className="mt-1.5 text-xs font-medium text-accent hover:underline"
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
