import { useEffect, useState } from 'react';
import { config } from '../config';
import { cn } from '../ui';

/** Brand mark: custom logo from VITE_BRAND_LOGO_URL, else the built-in "A·" mark. */
export function Logo({ className }: { className?: string }) {
  if (config.brandLogoUrl)
    return <img src={config.brandLogoUrl} alt="" className={cn('size-7 rounded-sm object-contain', className)} />;
  return (
    <svg viewBox="0 0 32 32" className={cn('size-7', className)} aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-surface-2" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" fill="none" className="stroke-line-strong" />
      <path
        d="M9 21.5 14.2 10.5h3.6L23 21.5"
        fill="none"
        className="stroke-fg"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="19.2" r="2.6" className="fill-accent" />
    </svg>
  );
}

export function GitHubIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

function formatStars(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n);
}

/** "Star" link to the repo; shows the live star count when GitHub answers. */
export function GitHubStar({ className }: { className?: string }) {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    const match = config.repoUrl.match(/github\.com\/([^/]+\/[^/]+)/);
    if (!match) return;
    const cacheKey = `ogs.stars.${match[1]}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        setStars(Number(cached));
        return;
      }
    } catch {
      /* ignore */
    }
    const ctrl = new AbortController();
    fetch(`https://api.github.com/repos/${match[1]}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { stargazers_count?: number } | null) => {
        if (typeof d?.stargazers_count !== 'number') return;
        setStars(d.stargazers_count);
        try {
          sessionStorage.setItem(cacheKey, String(d.stargazers_count));
        } catch {
          /* ignore */
        }
      })
      .catch(() => undefined);
    return () => ctrl.abort();
  }, []);

  return (
    <a
      href={config.repoUrl}
      target="_blank"
      rel="noreferrer"
      aria-label={`Star ${config.brandName} on GitHub`}
      className={cn(
        'inline-flex h-8 items-center overflow-hidden rounded-sm border border-line text-[13px] text-fg-muted transition-colors hover:border-line-strong hover:text-fg',
        className,
      )}
    >
      <span className="inline-flex items-center gap-1.5 px-2.5">
        <GitHubIcon size={15} />
        <span className="hidden sm:inline">Star</span>
      </span>
      {stars !== null && (
        <span className="inline-flex h-full items-center border-l border-line bg-surface-2/60 px-2 font-mono text-xs tabular-nums">
          {formatStars(stars)}
        </span>
      )}
    </a>
  );
}
