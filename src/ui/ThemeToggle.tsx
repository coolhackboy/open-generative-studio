import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from './cn';
import { resolvedTheme, useTheme } from './theme';
import { Tooltip } from './Tooltip';

/** Two-state toggle: flips between dark and light (starting from the system theme). */
export function ThemeToggle({ className }: { className?: string }) {
  const pref = useTheme((s) => s.pref);
  const setPref = useTheme((s) => s.setPref);
  const [current, setCurrent] = useState(() => resolvedTheme(pref));

  useEffect(() => {
    setCurrent(resolvedTheme(pref));
    const mq = window.matchMedia?.('(prefers-color-scheme: light)');
    const onChange = () => setCurrent(resolvedTheme(useTheme.getState().pref));
    mq?.addEventListener?.('change', onChange);
    return () => mq?.removeEventListener?.('change', onChange);
  }, [pref]);

  const next = current === 'dark' ? 'light' : 'dark';
  const Icon = current === 'dark' ? Moon : Sun;
  return (
    <Tooltip label={`Switch to ${next} theme`}>
      <button
        type="button"
        onClick={() => setPref(next)}
        aria-label={`Switch to ${next} theme`}
        className={cn(
          'inline-flex size-9 items-center justify-center rounded-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg',
          className,
        )}
      >
        <Icon size={17} strokeWidth={1.75} />
      </button>
    </Tooltip>
  );
}
