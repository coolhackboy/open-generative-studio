import { ArrowUpRight, KeyRound } from 'lucide-react';
import { config } from '../config';
import { useUI } from '../lib/store';
import { Button } from '../ui';

/** Slim reminder shown above an existing gallery when no API key is set. */
export function KeyReminder() {
  const openSettings = useUI((s) => s.setSettingsOpen);
  return (
    <section
      aria-label="API key required"
      className="glow flex flex-col gap-3 rounded-lg border border-line bg-surface px-4 py-3.5 sm:flex-row sm:items-center"
    >
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-ink">
        <KeyRound size={17} />
      </span>
      <p className="min-w-0 flex-1 text-sm text-fg-muted">
        <span className="font-medium text-fg">Add your {config.provider.name} API key to generate.</span> It stays in this
        browser and every generation bills your own account.
      </p>
      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={() => openSettings(true)}>
          Add key
        </Button>
        <a
          href={config.provider.onboardingKeyUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 items-center gap-1 rounded-sm border border-line-strong px-3 text-sm text-fg hover:bg-surface-2"
        >
          Get a key <ArrowUpRight size={14} />
        </a>
      </div>
    </section>
  );
}
