import { motion, useInView, useReducedMotion } from 'motion/react';
import { Check, CircleAlert, Download, Film, Layers, RotateCcw, Trash2, Wand2, X } from 'lucide-react';
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAttention } from '../lib/attention';
import { downloadFile } from '../lib/download';
import { formatDuration } from '../lib/format';
import { useGallery, useUI } from '../lib/store';
import { etaFor, retry, reuse } from '../lib/tasks';
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
        className="relative inline-flex size-8 items-center justify-center rounded-sm bg-black/50 text-white/90 backdrop-blur-md transition-colors before:absolute before:-inset-1.5 hover:bg-black/75 hover:text-white"
      >
        {children}
      </button>
    </Tooltip>
  );
}

/** Lazy video: no network until near the viewport. Scrubbing is driven by the card (pointer move). */
function LazyVideo({ url, onMeta, onReady }: { url: string; onMeta: (w: number, h: number, d: number) => void; onReady: () => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const near = useInView(wrap, { margin: '400px 0px', once: true });
  return (
    <div ref={wrap} className="absolute inset-0">
      {near && (
        <video
          src={`${url}#t=0.1`}
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={(e) => onMeta(e.currentTarget.videoWidth, e.currentTarget.videoHeight, e.currentTarget.duration)}
          onLoadedData={onReady}
          className="size-full object-cover"
        />
      )}
    </div>
  );
}

function Finished({ gen, compact }: { gen: Generation; compact: boolean }) {
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
        <LazyVideo
          url={file.url}
          onMeta={(w, h, d) => {
            measure(w, h);
            setDuration(d);
          }}
          onReady={() => setLoaded(true)}
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
      {!loaded && <div className="shimmer pointer-events-none absolute inset-0" />}

      <div className="pointer-events-none absolute top-0 left-0 flex gap-1 p-2 in-data-selecting:pl-10">
        {isVideo && (
          <span className="inline-flex items-center gap-1 rounded-xs bg-black/50 px-1.5 py-0.5 font-mono text-xs text-white/90 backdrop-blur-md">
            <Film size={11} />
            {duration ? formatDuration(duration * 1000) : 'Video'}
          </span>
        )}
        {gen.files.length > 1 && (
          <span className="inline-flex items-center gap-1 rounded-xs bg-black/50 px-1.5 py-0.5 font-mono text-xs text-white/90 backdrop-blur-md">
            <Layers size={11} />
            {gen.files.length}
          </span>
        )}
      </div>

      {!compact && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-3 pt-10 opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100">
          <p dir="auto" className="line-clamp-2 text-sm text-white/95 [overflow-wrap:anywhere]">{gen.prompt || 'No prompt'}</p>
          <p className="mt-1 text-xs text-white/65">
            {gen.modelName}
            {gen.variantLabel ? ` · ${gen.variantLabel}` : ''}
          </p>
        </div>
      )}

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

function InProgress({ gen, compact }: { gen: Generation; compact: boolean }) {
  const now = useNow(true);
  const queued = gen.status === 'submitting' || gen.status === 'not_started';
  const label = gen.status === 'submitting' ? 'Submitting' : queued ? 'Queued' : 'Generating';
  const pct = Math.round(gen.progress);
  const elapsed = now - gen.createdAt;
  const eta = etaFor(gen.variant);
  const remaining = eta ? eta - elapsed : undefined;
  const indeterminate = queued || pct <= 0;

  return (
    <div className="absolute inset-0 bg-surface">
      <div className="shimmer absolute inset-0" />
      <div aria-hidden="true" className="glow absolute inset-0 opacity-70" />
      <div className={cn('relative flex h-full flex-col justify-between', compact ? 'p-2' : 'p-3')}>
        <div className="flex items-center justify-between gap-2 in-data-selecting:pl-8">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2/80 px-2 py-0.5 text-xs font-medium text-fg-muted">
            <Spinner size={11} className="text-accent-ink" />
            {label}
          </span>
          <span className="font-mono text-xs text-fg-subtle tabular-nums">{formatDuration(elapsed)}</span>
        </div>
        {!compact && (
          <div className="flex flex-col items-center gap-1">
            {!indeterminate ? (
              <span className="font-mono text-3xl font-medium tracking-tight text-fg tabular-nums">
                {pct}
                <span className="text-lg text-fg-subtle">%</span>
              </span>
            ) : (
              <span className="text-sm text-fg-subtle">
                {remaining && remaining > 0 ? `~${formatDuration(remaining)} left` : gen.modelName}
              </span>
            )}
          </div>
        )}
        <div className="flex flex-col gap-2">
          {!compact && <p dir="auto" className="line-clamp-2 text-xs text-fg-muted [overflow-wrap:anywhere]">{gen.prompt}</p>}
          {compact && !indeterminate && <span className="font-mono text-sm text-fg tabular-nums">{pct}%</span>}
          <div className="relative h-0.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label={`${label} ${gen.modelName}`} aria-valuenow={indeterminate ? undefined : pct} aria-valuemin={0} aria-valuemax={100}>
            {indeterminate ? (
              <span className="absolute inset-y-0 left-0 w-[30%] animate-sweep rounded-full bg-accent" />
            ) : (
              <motion.div
                className="h-full rounded-full bg-accent"
                initial={false}
                animate={{ width: `${Math.max(6, pct)}%` }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Failed({ gen, compact }: { gen: Generation; compact: boolean }) {
  const remove = useGallery((s) => s.remove);
  const [busy, setBusy] = useState(false);
  return (
    <div className={cn('absolute inset-0 flex flex-col bg-surface', compact ? 'p-2' : 'p-3')}>
      <div className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-danger in-data-selecting:pl-8">
        <CircleAlert size={14} />
        {gen.notSent ? (compact ? 'Not sent' : 'Not sent — nothing billed') : 'Failed'}
      </div>
      <p className={cn('mt-1.5 min-h-0 overflow-hidden text-xs text-fg-muted', compact ? 'line-clamp-2' : 'line-clamp-3')}>
        {gen.error || 'Generation failed.'}
      </p>
      {!compact && <p dir="auto" className="mt-auto line-clamp-1 shrink-0 pt-2 text-xs text-fg-subtle [overflow-wrap:anywhere]">{gen.modelName} · {gen.prompt}</p>}
      <div className={cn('relative z-10 flex shrink-0 gap-1.5', compact ? 'mt-auto' : 'mt-2')}>
        <button
          type="button"
          disabled={busy}
          onClick={async (e) => {
            e.stopPropagation();
            setBusy(true);
            await retry(gen.id);
            setBusy(false);
          }}
          className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-line-strong bg-surface-2 px-2.5 text-xs font-medium text-fg transition-colors hover:bg-surface-3 disabled:opacity-60 max-sm:h-9"
        >
          {busy ? <Spinner size={12} /> : <RotateCcw size={12} />}
          Retry
        </button>
        <button
          type="button"
          aria-label={gen.notSent ? 'Dismiss' : 'Delete'}
          onClick={(e) => {
            e.stopPropagation();
            remove(gen.id);
            if (!gen.notSent) toast.success('Deleted');
          }}
          className="inline-flex size-8 items-center justify-center rounded-sm text-fg-subtle transition-colors hover:bg-danger-soft hover:text-danger max-sm:size-9"
        >
          {gen.notSent ? <X size={14} /> : <Trash2 size={13} />}
        </button>
      </div>
    </div>
  );
}

export const GenerationCard = memo(function GenerationCard({
  gen,
  size,
  visibleIds,
}: {
  gen: Generation;
  size: { width: number; height: number };
  visibleIds: string[];
}) {
  const open = useUI((s) => s.openLightbox);
  const selected = useGallery((s) => s.selected.includes(gen.id));
  const selecting = useGallery((s) => s.selected.length > 0);
  const toggleSelect = useGallery((s) => s.toggleSelect);
  const justFinished = useAttention((s) => s.justFinished.includes(gen.id));
  const unseen = useAttention((s) => s.unseen.includes(gen.id));
  const markSeen = useAttention((s) => s.markSeen);
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.5 });

  const failed = gen.status === 'failed';
  const finished = gen.status === 'finished' && gen.files.length > 0;
  const kind = gen.category === 'video' ? 'video' : 'image';
  const compact = size.width < 210 || size.height < 150;

  // Mark results seen once they're actually on screen in a visible tab.
  useEffect(() => {
    if (!unseen || !inView || document.hidden) return;
    const t = setTimeout(() => markSeen(gen.id), 700);
    return () => clearTimeout(t);
  }, [unseen, inView, markSeen, gen.id]);

  const celebrate = finished && justFinished && !reduce;
  const [scrub, setScrub] = useState<number | null>(null);
  const isVideo = finished && gen.files[0]?.type === 'video';

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.97, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'group relative size-full overflow-hidden rounded-md bg-surface-2 ring-1 ring-line transition-shadow duration-200 hover:ring-line-strong',
        failed && 'ring-danger/25',
        selected && 'ring-2 ring-accent',
        celebrate && 'animate-ring',
      )}
      data-selecting={selecting || undefined}
      onPointerMove={(e) => {
        if (!isVideo || e.pointerType !== 'mouse') return;
        const v = e.currentTarget.querySelector('video');
        if (!v || !v.duration) return;
        const r = e.currentTarget.getBoundingClientRect();
        const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
        v.currentTime = f * v.duration;
        setScrub(f);
      }}
      onPointerLeave={(e) => {
        if (!isVideo) return;
        const v = e.currentTarget.querySelector('video');
        if (v) v.currentTime = 0.1;
        setScrub(null);
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          if (e.shiftKey || e.metaKey || e.ctrlKey || selecting) {
            e.preventDefault();
            toggleSelect(gen.id, e.shiftKey, visibleIds);
            return;
          }
          open(gen.id);
        }}
        aria-pressed={selecting ? selected : undefined}
        aria-label={`${selecting ? (selected ? 'Deselect' : 'Select') : 'Open'} ${failed ? 'failed ' : finished ? '' : 'pending '}${kind}${unseen && finished ? ' (new result)' : ''}: ${gen.prompt || gen.modelName}`}
        className="absolute inset-0 z-0 rounded-md focus-visible:outline-offset-[-2px]"
      />
      <motion.div
        className="pointer-events-none absolute inset-0 [&_button]:pointer-events-auto"
        initial={celebrate ? { filter: 'blur(14px)', scale: 1.03 } : false}
        animate={{ filter: 'blur(0px)', scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        {finished ? <Finished gen={gen} compact={compact} /> : failed ? <Failed gen={gen} compact={compact} /> : <InProgress gen={gen} compact={compact} />}
      </motion.div>
      {scrub !== null && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-white/20">
          <span className="block h-full bg-accent" style={{ width: `${scrub * 100}%` }} />
        </span>
      )}
      {(selecting || selected) && (
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute top-2 left-2 flex size-6 items-center justify-center rounded-full border-2',
            selected ? 'border-accent bg-accent text-accent-fg' : 'border-white/80 bg-black/30',
          )}
        >
          {selected && <Check size={14} strokeWidth={3} />}
        </span>
      )}
      {unseen && finished && !selected && (
        <span aria-hidden="true" className="absolute top-2 left-2 size-2.5 rounded-full bg-accent ring-2 ring-black/40" />
      )}
    </motion.div>
  );
});
