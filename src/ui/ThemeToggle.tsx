import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from './cn';
import { useTheme, type ThemePref } from './theme';
import { Tooltip } from './Tooltip';

const ORDER: ThemePref[] = ['system', 'dark', 'light'];
const LABEL: Record<ThemePref, string> = { system: 'System theme', dark: 'Dark theme', light: 'Light theme' };

/** Icon button cycling system → dark → light. */
export function ThemeToggle({ className }: { className?: string }) {
  const pref = useTheme((s) => s.pref);
  const setPref = useTheme((s) => s.setPref);
  const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
  const Icon = pref === 'system' ? Monitor : pref === 'dark' ? Moon : Sun;
  return (
    <Tooltip label={`${LABEL[pref]} · switch to ${next}`}>
      <button
        type="button"
        onClick={() => setPref(next)}
        aria-label={`${LABEL[pref]}. Switch to ${next}`}
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
