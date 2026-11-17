import { FlaskConical, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { config } from '../config';
import { MOCK_MODE } from '../lib/api';
import { useSettings, useUI } from '../lib/store';
import { cn, ThemeToggle, Tooltip } from '../ui';
import { GitHubStar, Logo } from './Brand';

export function TopBar() {
  const [scrolled, setScrolled] = useState(false);
  const hasKey = useSettings((s) => Boolean(s.apiKey));
  const openSettings = useUI((s) => s.setSettingsOpen);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b transition-[background-color,border-color] duration-200',
        scrolled ? 'glass border-line' : 'border-transparent bg-bg',
      )}
    >
      <a
        href="#prompt-input"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[90] focus:rounded-sm focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to prompt
      </a>
      <div className="mx-auto flex h-14 max-w-[1800px] items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <a href="./" className="flex min-w-0 items-center gap-2.5 rounded-sm" aria-label={`${config.brandName} home`}>
          <Logo />
          <span className="truncate text-[15px] font-semibold tracking-[-0.015em] text-fg">{config.brandName}</span>
        </a>

        {MOCK_MODE && (
          <Tooltip label="Simulated API — no requests, no credits">
            <span data-mock-badge className="inline-flex h-6 items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 text-xs font-medium text-warning">
              <FlaskConical size={12} />
              Mock
            </span>
          </Tooltip>
        )}

        <div className="flex-1" />

        {config.showPoweredBy && (
          <a
            href={config.provider.homeUrl}
            target="_blank"
            rel="noreferrer"
            className="hidden items-center gap-1 rounded-sm px-2 text-xs text-fg-subtle transition-colors hover:text-fg md:inline-flex"
          >
            Powered by <span className="font-medium text-fg-muted">{config.provider.name}</span>
          </a>
        )}
        <GitHubStar />
        <ThemeToggle />
        <Tooltip label="Settings">
          <button
            type="button"
            onClick={() => openSettings(true)}
            aria-label={hasKey || MOCK_MODE ? 'Settings' : 'Settings — API key missing'}
            className="relative inline-flex size-9 items-center justify-center rounded-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <Settings size={17} strokeWidth={1.75} />
            {!hasKey && !MOCK_MODE && (
              <span className="absolute top-2 right-2 size-1.5 rounded-full bg-accent ring-2 ring-bg" />
            )}
          </button>
        </Tooltip>
      </div>
    </header>
  );
}
