import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clapperboard,
  Copy,
  Download,
  Maximize2,
  Paperclip,
  PenLine,
  RotateCcw,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { config } from '../config';
import { findVariant, getModel } from '../data/catalog';
import { useAttention } from '../lib/attention';
import { copyText } from '../lib/clipboard';
import { formatUSD } from '../lib/cost';
import { downloadFile } from '../lib/download';
import { formatDuration, timeAgo } from '../lib/format';
import { formatOption, humanize, isMediaField } from '../lib/schema';
import { focusPrompt, useGallery, useUI } from '../lib/store';
import { animateImage, attachAsReference, editImage, retry, reuse } from '../lib/tasks';
import type { Generation } from '../lib/types';
import { Button, cn, Dialog, Spinner, toast, Tooltip } from '../ui';
import { CodeTabs } from './CodeTabs';
import { ModelThumb } from './ModelThumb';

function formatValue(v: unknown, key: string): string {
  if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? '' : 's'}`;
  if (v && typeof v === 'object') return JSON.stringify(v);
  return formatOption({ name: key }, v);
}

/** Zoomable image: click toggles 2× at the click point, pointer pans; pinch on touch. */
function ZoomImage({ src, alt }: { src: string; alt: string }) {
  const [zoom, setZoom] = useState(1);
  const [origin, setOrigin] = useState('50% 50%');
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  useEffect(() => {
    setZoom(1);
  }, [src]);

  const setOriginFrom = (e: React.PointerEvent<HTMLImageElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setOrigin(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`);
  };

  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      onClick={(e) => {
        if (pinch.current) return;
        setOriginFrom(e as unknown as React.PointerEvent<HTMLImageElement>);
        setZoom((z) => (z > 1 ? 1 : 2));
      }}
      onPointerDown={(e) => {
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size === 2) {
          const [a, b] = [...pointers.current.values()];
          pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
        }
      }}
      onPointerMove={(e) => {
        if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinch.current && pointers.current.size === 2) {
          const [a, b] = [...pointers.current.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          setZoom(Math.min(4, Math.max(1, (pinch.current.zoom * d) / pinch.current.dist)));
        } else if (zoom > 1 && e.pointerType === 'mouse') setOriginFrom(e);
      }}
      onPointerUp={(e) => {
        pointers.current.delete(e.pointerId);
        if (pointers.current.size < 2) setTimeout(() => (pinch.current = null), 50);
      }}
      onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
      style={{ transform: `scale(${zoom})`, transformOrigin: origin, touchAction: zoom > 1 ? 'none' : 'pan-y' }}
      className={cn(
        'max-h-full max-w-full rounded-sm object-contain transition-transform duration-200 ease-out-soft select-none',
        zoom > 1 ? 'cursor-zoom-out' : 'cursor-zoom-in',
      )}
    />
  );
}

function Stage({ gen, index }: { gen: Generation; index: number }) {
  const file = gen.files[index];
  if (gen.status === 'failed') {
    return (
      <div className="flex max-w-md flex-col items-center gap-3 px-6 text-center">
        <CircleAlert size={28} className="text-danger" />
        <p className="text-base font-medium text-fg">{gen.notSent ? 'Not sent — nothing billed' : 'Generation failed'}</p>
        <p className="text-sm text-fg-muted">{gen.error}</p>
      </div>
    );
  }
  if (!file) {
    return (
      <div className="flex flex-col items-center gap-3 text-fg-muted">
        <Spinner size={22} className="text-accent-ink" />
        <p className="font-mono text-sm tabular-nums">
          {gen.status === 'running' && gen.progress > 0 ? `${Math.round(gen.progress)}%` : 'Queued'}
        </p>
      </div>
    );
  }
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={file.url}
        initial={{ opacity: 0, scale: 0.985 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="flex size-full items-center justify-center overflow-hidden"
      >
        {file.type === 'video' ? (
          <video src={file.url} controls autoPlay loop playsInline className="max-h-full max-w-full rounded-sm object-contain" />
        ) : file.type === 'audio' ? (
          <audio src={file.url} controls className="w-full max-w-md" />
        ) : (
          <ZoomImage src={file.url} alt={gen.prompt || gen.modelName} />
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="border-t border-line px-5 py-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="label">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function ActionButton({ icon, label, onClick, disabled }: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-10 items-center gap-2 rounded-sm border border-line bg-surface-2/60 px-3 text-sm text-fg transition-colors hover:bg-surface-3 disabled:opacity-40 max-sm:h-11"
    >
      <span className="text-fg-muted">{icon}</span>
      {label}
    </button>
  );
}

export function Lightbox() {
  const id = useUI((s) => s.lightboxId);
  const open = useUI((s) => s.openLightbox);
  const items = useGallery((s) => s.items);
  const filter = useGallery((s) => s.filter);
  const remove = useGallery((s) => s.remove);
  const markSeen = useAttention((s) => s.markSeen);
  const [fileIndex, setFileIndex] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);

  const list = useMemo(() => (filter === 'all' ? items : items.filter((g) => g.category === filter)), [items, filter]);
  const pos = list.findIndex((g) => g.id === id);
  const gen = pos >= 0 ? list[pos] : items.find((g) => g.id === id);

  useEffect(() => {
    setFileIndex(0);
    setConfirmDelete(false);
    if (id) markSeen(id);
  }, [id, markSeen]);

  const go = (delta: number) => {
    if (pos < 0) return;
    const next = list[pos + delta];
    if (next) open(next.id);
  };

  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, pre, [role="radiogroup"], video, audio')) return;
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key.toLowerCase() === 'f' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (document.fullscreenElement) void document.exitFullscreen();
        else void stageRef.current?.requestFullscreen?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const close = () => open(null);
  const found = gen ? findVariant(gen.variant) : undefined;
  const model = found?.model ?? (gen ? getModel(gen.modelId) : undefined);

  const params = gen
    ? Object.entries(gen.input).filter(([k, v]) => {
        if (k === 'prompt') return false;
        const f = found?.variant.schema.properties[k];
        return !(f ? isMediaField(k, f) : /_urls?$/.test(k)) && v !== undefined;
      })
    : [];
  const refs = gen
    ? [
        ...new Set(
          Object.entries(gen.input).flatMap(([k, v]) => {
            const f = found?.variant.schema.properties[k];
            if (!(f ? isMediaField(k, f) : /_urls?$/.test(k))) return [];
            return (Array.isArray(v) ? v : [v]).filter((u): u is string => typeof u === 'string');
          }),
        ),
      ]
    : [];

  const file = gen?.files[fileIndex];
  const charged = gen && gen.credits != null && (gen.credits > 0 || gen.status === 'finished') ? gen.credits : undefined;
  const usd = charged != null ? charged * config.provider.creditUSD : undefined;
  const neighbors = pos >= 0 ? list.slice(Math.max(0, pos - 6), pos + 7) : [];
  const isImage = file?.type === 'image';

  return (
    <Dialog open={Boolean(gen)} onClose={close} title={gen ? `${gen.modelName}: ${gen.prompt}` : 'Details'} hideHeader size="full" mobile="full">
      {gen && (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto md:grid md:grid-cols-[minmax(0,1fr)_400px] md:overflow-hidden">
          {/* Stage */}
          <div
            ref={stageRef}
            className="relative flex h-[62dvh] flex-col bg-bg-subtle md:h-auto md:min-h-0"
            onPointerDown={(e) => {
              if (e.pointerType !== 'mouse') swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
            }}
            onPointerUp={(e) => {
              const s = swipe.current;
              swipe.current = null;
              if (!s || s.id !== e.pointerId) return;
              const dx = e.clientX - s.x;
              if (Math.abs(dx) > 60 && Math.abs(e.clientY - s.y) < 50) go(dx < 0 ? 1 : -1);
            }}
          >
            <div className="flex min-h-0 flex-1 items-center justify-center p-3 md:px-16 md:py-6">
              <Stage gen={gen} index={fileIndex} />
            </div>

            {gen.files.length > 1 && (
              <div className="absolute top-3 right-3 flex gap-1.5">
                {gen.files.map((f, i) => (
                  <button
                    key={f.url + i}
                    type="button"
                    aria-label={`Show output ${i + 1} of ${gen.files.length}`}
                    aria-current={i === fileIndex}
                    onClick={() => setFileIndex(i)}
                    className={cn(
                      'size-10 overflow-hidden rounded-xs ring-2 transition-all',
                      i === fileIndex ? 'ring-accent' : 'opacity-60 ring-transparent hover:opacity-100',
                    )}
                  >
                    <img src={f.url} alt="" className="size-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {neighbors.length > 1 && (
              <div className="no-scrollbar flex shrink-0 justify-center gap-1.5 overflow-x-auto px-3 pb-3" aria-label="Nearby generations">
                {neighbors.map((g) => {
                  const f = g.files[0];
                  return (
                    <button
                      key={g.id}
                      type="button"
                      aria-label={`Open ${g.prompt || g.modelName}`}
                      aria-current={g.id === gen.id}
                      onClick={() => open(g.id)}
                      className={cn(
                        'size-12 shrink-0 overflow-hidden rounded-xs bg-surface-3 ring-2 transition-all',
                        g.id === gen.id ? 'ring-accent' : 'opacity-55 ring-transparent hover:opacity-100',
                      )}
                    >
                      {f?.type === 'image' ? (
                        <img src={f.url} alt="" loading="lazy" className="size-full object-cover" />
                      ) : f?.type === 'video' ? (
                        <video src={`${f.url}#t=0.1`} muted preload="metadata" className="size-full object-cover" />
                      ) : (
                        <span className="flex size-full items-center justify-center text-fg-subtle">
                          {g.status === 'failed' ? <CircleAlert size={14} /> : <Spinner size={12} />}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {pos > 0 && (
              <button
                type="button"
                aria-label="Previous"
                onClick={() => go(-1)}
                className="glass absolute top-1/2 left-3 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full border border-line text-fg-muted transition-colors hover:text-fg md:inline-flex"
              >
                <ChevronLeft size={18} />
              </button>
            )}
            {pos >= 0 && pos < list.length - 1 && (
              <button
                type="button"
                aria-label="Next"
                onClick={() => go(1)}
                className="glass absolute top-1/2 right-3 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full border border-line text-fg-muted transition-colors hover:text-fg md:inline-flex"
              >
                <ChevronRight size={18} />
              </button>
            )}
            <div className="absolute top-3 left-3 flex gap-1.5">
              <button
                type="button"
                aria-label="Close"
                data-autofocus
                onClick={close}
                className="glass inline-flex size-11 items-center justify-center rounded-full border border-line text-fg-muted transition-colors hover:text-fg md:hidden"
              >
                <X size={18} />
              </button>
              {file && (
                <Tooltip label="Fullscreen (F)">
                  <button
                    type="button"
                    aria-label="Fullscreen"
                    onClick={() => void stageRef.current?.requestFullscreen?.()}
                    className="glass hidden size-9 items-center justify-center rounded-full border border-line text-fg-muted transition-colors hover:text-fg md:inline-flex"
                  >
                    <Maximize2 size={15} />
                  </button>
                </Tooltip>
              )}
            </div>
          </div>

          {/* Details */}
          <aside className="flex flex-col border-line pb-[env(safe-area-inset-bottom)] md:min-h-0 md:overflow-y-auto md:border-l thin-scrollbar">
            <div className="flex items-start gap-3 px-5 pt-5 pb-4">
              <ModelThumb model={model} className="size-10 rounded-sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-semibold text-fg">{gen.modelName}</div>
                <div className="mt-0.5 truncate text-sm text-fg-subtle">
                  {gen.variantLabel ? `${gen.variantLabel} · ` : ''}
                  <span title={new Date(gen.createdAt).toLocaleString()}>{timeAgo(gen.createdAt)}</span>
                  {gen.finishedAt && gen.status === 'finished' && ` · took ${formatDuration(gen.finishedAt - gen.createdAt)}`}
                </div>
              </div>
              <button
                type="button"
                aria-label="Close"
                data-autofocus
                onClick={close}
                className="-mt-1 -mr-1 hidden size-9 items-center justify-center rounded-sm text-fg-muted hover:bg-surface-2 hover:text-fg md:inline-flex"
              >
                <X size={17} />
              </button>
            </div>

            <div className="px-5 pb-4">
              <div className="mb-1.5 flex items-center justify-between">
                <h3 className="label">Prompt</h3>
                {gen.prompt && (
                  <button
                    type="button"
                    onClick={() => void copyText(gen.prompt, 'Prompt copied')}
                    className="inline-flex h-7 items-center gap-1 rounded-xs px-1.5 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg"
                  >
                    <Copy size={12} /> Copy prompt
                  </button>
                )}
              </div>
              <p className="text-base whitespace-pre-wrap text-fg">{gen.prompt || '—'}</p>
              {params.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Settings">
                  {params.map(([k, v]) => (
                    <li key={k} className="rounded-xs border border-line px-1.5 py-0.5 text-xs text-fg-muted">
                      <span className="text-fg-subtle">{humanize(k)}</span> <span className="font-mono text-fg">{formatValue(v, k)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {refs.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {refs.map((u) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer" className="size-11 overflow-hidden rounded-xs bg-surface-3 ring-1 ring-line">
                      {/\.(mp4|webm|mov)(\?|$)/i.test(u) ? (
                        <video src={u} muted preload="metadata" className="size-full object-cover" />
                      ) : (
                        <img src={u} alt="Reference" className="size-full object-cover" />
                      )}
                    </a>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 px-5 pb-4">
              {gen.status === 'failed' ? (
                <Button variant="primary" className="h-10" icon={<RotateCcw size={15} />} onClick={() => void retry(gen.id)}>
                  Retry
                </Button>
              ) : (
                <Button
                  variant="primary"
                  className="h-10"
                  disabled={!file}
                  icon={<Download size={15} />}
                  onClick={() => file && void downloadFile(file.url, gen)}
                >
                  Download
                </Button>
              )}
              <ActionButton
                icon={<Wand2 size={15} />}
                label="Reuse settings"
                onClick={() => {
                  reuse(gen);
                  close();
                  toast.success('Settings loaded into the composer');
                  requestAnimationFrame(focusPrompt);
                }}
              />
              {isImage && file && (
                <>
                  <ActionButton
                    icon={<Clapperboard size={15} />}
                    label="Animate"
                    onClick={() => {
                      animateImage(file.url, gen.prompt);
                      close();
                    }}
                  />
                  <ActionButton
                    icon={<PenLine size={15} />}
                    label="Edit"
                    onClick={() => {
                      editImage(file.url);
                      close();
                    }}
                  />
                </>
              )}
              {file && (file.type === 'image' || file.type === 'video') && (
                <ActionButton
                  icon={<Paperclip size={15} />}
                  label="Use as reference"
                  onClick={() => {
                    attachAsReference(file.url, file.type === 'video' ? 'video' : 'image');
                    close();
                  }}
                />
              )}
            </div>

            <Section title="Cost">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-fg">
                  {gen.notSent ? (
                    <span className="text-fg-muted">Not sent — nothing billed</span>
                  ) : usd != null ? (
                    <>
                      <span className="font-mono">{formatUSD(usd)}</span>
                      <span className="text-fg-subtle"> charged · {charged} credits</span>
                    </>
                  ) : gen.estimateUSD != null ? (
                    <>
                      <span className="font-mono">≈ {formatUSD(gen.estimateUSD)}</span>
                      <span className="text-fg-subtle"> estimated</span>
                    </>
                  ) : (
                    <span className="text-fg-subtle">—</span>
                  )}
                </span>
                {gen.taskId && (
                  <span className="truncate font-mono text-xs text-fg-subtle" title="Task ID">
                    {gen.taskId}
                  </span>
                )}
              </div>
            </Section>

            <div className="border-t border-line px-5 py-4">
              <CodeTabs baseUrl={gen.apiBase} model={gen.variant} input={gen.input} />
              {found?.variant.docUrl && (
                <a
                  href={found.variant.docUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
                >
                  API reference for {gen.variant} <ArrowUpRight size={11} />
                </a>
              )}
            </div>

            <div className="mt-auto flex items-center justify-between gap-2 border-t border-line px-5 py-3">
              <span className="text-xs text-fg-subtle">
                {pos >= 0 ? `${pos + 1} of ${list.length}` : ''}
                <span className="hidden md:inline">{pos >= 0 && ' · ← → browse · F fullscreen'}</span>
              </span>
              <Button
                variant={confirmDelete ? 'danger' : 'ghost'}
                size="sm"
                icon={<Trash2 size={14} />}
                onClick={() => {
                  if (!confirmDelete) return setConfirmDelete(true);
                  const next = list[pos + 1] ?? list[pos - 1];
                  remove(gen.id);
                  open(next ? next.id : null);
                  toast.success('Deleted from this browser');
                }}
              >
                {confirmDelete ? 'Confirm delete' : 'Delete'}
              </Button>
            </div>
          </aside>
        </div>
      )}
    </Dialog>
  );
}
