import { motion } from 'motion/react';
import { CircleAlert, Download, Film, Layers, RotateCcw, Trash2, Wand2 } from 'lucide-react';
import { memo, useEffect, useState, type ReactNode } from 'react';
import { formatDuration } from '../lib/format';
import { downloadFile } from '../lib/download';
import { useGallery, useUI } from '../lib/store';
import { retry, reuse } from '../lib/tasks';
import type { Generation } from '../lib/types';
import { cn, Spinner, toast, Tooltip } from '../ui';

function useNow(active: boolean, ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [active, ms]);
  return now;
}

function CardAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className="inline-flex size-8 items-center justify-center rounded-sm bg-black/45 text-white/90 backdrop-blur-md transition-colors hover:bg-black/70 hover:text-white"
      >
        {children}
      </button>
    </Tooltip>
  );
}

function Finished({ gen }: { gen: Generation }) {
  const file = gen.files[0];
  const [loaded, setLoaded] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const patch = useGallery((s) => s.patch);

  const measure = (w: number, h: number) => {
    if (!w || !h) return;
    const aspect = w / h;
    if (!gen.aspect || Math.abs(gen.aspect - aspect) > 0.02) patch(gen.id, { aspect });
  };

  const isVideo = file?.type === 'video';

  return (
    <>
      {isVideo ? (
        <video
          src={`${file.url}#t=0.1`}
          muted
          loop
          playsInline
          preload="metadata"
          onLoadedMetadata={(e) => {
            measure(e.currentTarget.videoWidth, e.currentTarget.videoHeight);
            setDuration(e.currentTarget.duration);
          }}
          onLoadedData={() => setLoaded(true)}
          className={cn('size-full object-cover transition-opacity duration-500', loaded ? 'opacity-100' : 'opacity-0')}
        />
      ) : (
        <img
          src={file?.url}
          alt={gen.prompt || gen.modelName}
          loading="lazy"
          decoding="async"
          onLoad={(e) => {
            measure(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight);
            setLoaded(true);
          }}
          className={cn(
            'size-full object-cover transition-[opacity,transform] duration-700 ease-out-soft group-hover:scale-[1.025]',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
        />
      )}
      {!loaded && <div className="shimmer absolute inset-0" />}

      <div className="pointer-events-none absolute top-0 left-0 flex gap-1 p-2">
        {isVideo && (
          <span className="inline-flex items-center gap-1 rounded-xs bg-black/45 px-1.5 py-0.5 font-mono text-2xs text-white/90 backdrop-blur-md">
            <Film size={11} />
            {duration ? formatDuration(duration * 1000) : 'Video'}
          </span>
        )}
        {gen.files.length > 1 && (
          <span className="inline-flex items-center gap-1 rounded-xs bg-black/45 px-1.5 py-0.5 font-mono text-2xs text-white/90 backdrop-blur-md">
            <Layers size={11} />
            {gen.files.length}
          </span>
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-3 pt-10 opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100">
        <p className="line-clamp-2 text-[13px] leading-[18px] text-white/95">{gen.prompt || 'No prompt'}</p>
        <p className="mt-1 text-2xs text-white/60">
          {gen.modelName}
          {gen.variantLabel ? ` · ${gen.variantLabel}` : ''}
        </p>
      </div>

      <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100">
        <CardAction label="Reuse settings" onClick={() => reuse(gen)}>
          <Wand2 size={14} />
        </CardAction>
        {file && (
          <CardAction label="Download" onClick={() => void downloadFile(file.url, gen)}>
            <Download size={14} />
          </CardAction>
        )}
      </div>
    </>
  );
}

function InProgress({ gen }: { gen: Generation }) {
  const now = useNow(true);
  const queued = gen.status === 'submitting' || gen.status === 'not_started';
  const label = gen.status === 'submitting' ? 'Submitting' : queued ? 'Queued' : 'Generating';
  const pct = Math.round(gen.progress);
  return (
    <div className="absolute inset-0 bg-surface">
      <div className="shimmer absolute inset-0" />
      <div
        aria-hidden="true"
        className="absolute -bottom-1/3 left-1/2 size-[80%] -translate-x-1/2 rounded-full bg-accent opacity-[0.06] blur-3xl"
      />
      <div className="relative flex h-full flex-col justify-between p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2/80 px-2 py-0.5 text-2xs font-medium text-fg-muted">
            <Spinner size={11} className="text-accent" />
            {label}
          </span>
          <span className="font-mono text-2xs text-fg-subtle tabular-nums">{formatDuration(now - gen.createdAt)}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          {!queued && pct > 0 ? (
            <span className="font-mono text-3xl font-medium tracking-tight text-fg tabular-nums">
              {pct}
              <span className="text-lg text-fg-subtle">%</span>
            </span>
          ) : (
            <span className="text-xs text-fg-subtle">{gen.modelName}</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <p className="line-clamp-2 text-xs leading-[17px] text-fg-muted">{gen.prompt}</p>
          <div className="h-0.5 overflow-hidden rounded-full bg-surface-3">
            <motion.div
              className="h-full rounded-full bg-accent"
              initial={false}
              animate={{ width: `${queued ? 4 : Math.max(6, pct)}%` }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Failed({ gen }: { gen: Generation }) {
  const remove = useGallery((s) => s.remove);
  const [busy, setBusy] = useState(false);
  return (
    <div className="absolute inset-0 flex flex-col bg-surface p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-danger">
        <CircleAlert size={14} />
        Failed
      </div>
      <p className="mt-2 line-clamp-4 min-h-0 overflow-hidden text-xs leading-[17px] text-fg-muted">{gen.error || 'Generation failed.'}</p>
      <p className="mt-auto line-clamp-1 shrink-0 pt-2 text-2xs leading-4 text-fg-subtle">
        {gen.modelName} · {gen.prompt}
      </p>
      <div className="relative z-10 mt-2 flex shrink-0 gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={async (e) => {
            e.stopPropagation();
            setBusy(true);
            await retry(gen.id);
            setBusy(false);
          }}
          className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-line-strong bg-surface-2 px-2.5 text-xs font-medium text-fg transition-colors hover:bg-surface-3 disabled:opacity-60"
        >
          {busy ? <Spinner size={12} /> : <RotateCcw size={12} />}
          Retry
        </button>
        <button
          type="button"
          aria-label="Delete"
          onClick={(e) => {
            e.stopPropagation();
            remove(gen.id);
            toast.success('Deleted');
          }}
          className="inline-flex size-7 items-center justify-center rounded-sm text-fg-subtle transition-colors hover:bg-danger-soft hover:text-danger"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

export const GenerationCard = memo(function GenerationCard({ gen }: { gen: Generation }) {
  const open = useUI((s) => s.openLightbox);
  const failed = gen.status === 'failed';
  const finished = gen.status === 'finished' && gen.files.length > 0;
  const kind = gen.category === 'video' ? 'video' : 'image';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'group relative size-full overflow-hidden rounded-md bg-surface-2 ring-1 ring-line transition-shadow duration-200 hover:ring-line-strong',
        failed && 'ring-danger/25',
      )}
      onMouseEnter={(e) => void e.currentTarget.querySelector('video')?.play().catch(() => undefined)}
      onMouseLeave={(e) => {
        const v = e.currentTarget.querySelector('video');
        if (v) {
          v.pause();
          v.currentTime = 0.1;
        }
      }}
    >
      <button
        type="button"
        onClick={() => open(gen.id)}
        aria-label={`Open ${failed ? 'failed ' : finished ? '' : 'pending '}${kind}: ${gen.prompt || gen.modelName}`}
        className="absolute inset-0 z-0 rounded-md focus-visible:outline-offset-[-2px]"
      />
      <div className="pointer-events-none absolute inset-0 [&_button]:pointer-events-auto">
        {finished ? <Finished gen={gen} /> : failed ? <Failed gen={gen} /> : <InProgress gen={gen} />}
      </div>
    </motion.div>
  );
});
