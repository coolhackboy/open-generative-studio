import { Film, Image as ImageIcon } from 'lucide-react';
import { useState } from 'react';
import type { CatalogModel } from '../types/catalog';
import { cn } from '../ui';

/** Model cover thumbnail with a graceful icon fallback. */
export function ModelThumb({ model, className }: { model: CatalogModel | undefined; className?: string }) {
  const [failed, setFailed] = useState(false);
  const Icon = model?.category === 'video' ? Film : ImageIcon;
  return (
    <span className={cn('relative inline-flex shrink-0 overflow-hidden bg-surface-3', className)}>
      {model?.thumbnail && !failed ? (
        <img
          src={model.thumbnail}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <span className="flex size-full items-center justify-center text-fg-subtle">
          <Icon size={14} />
        </span>
      )}
    </span>
  );
}

/** Small provider logo (an SVG of a few KB) — use instead of the cover image at chip sizes. */
export function ProviderIcon({ model, className }: { model: CatalogModel; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!model.icon || failed)
    return (
      <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-xs bg-surface-3 font-mono text-xs text-fg-muted', className)}>
        {model.provider.charAt(0)}
      </span>
    );
  return (
    <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-xs bg-white p-0.5 ring-1 ring-line', className)}>
      <img src={model.icon} alt="" width={20} height={20} loading="lazy" onError={() => setFailed(true)} className="size-5 object-contain" />
    </span>
  );
}
