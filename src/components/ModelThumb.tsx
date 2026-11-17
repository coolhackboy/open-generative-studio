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
