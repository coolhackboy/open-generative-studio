import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Copy,
  Download,
  RotateCcw,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { config } from '../config';
import { findVariant, getModel } from '../data/catalog';
import { formatUSD } from '../lib/cost';
import { copyText } from '../lib/clipboard';
import { downloadFile } from '../lib/download';
import { formatDuration, timeAgo } from '../lib/format';
import { humanize, isMediaField } from '../lib/schema';
import { focusPrompt, useGallery, useUI } from '../lib/store';
import { retry, reuse } from '../lib/tasks';
import type { Generation } from '../lib/types';
import { Button, cn, Dialog, Spinner, toast } from '../ui';
import { CodeTabs } from './CodeTabs';
import { ModelThumb } from './ModelThumb';

function formatValue(v: unknown, key?: string): string {
  if (key === 'duration' && typeof v === 'number') return `${v}s`;
  if (typeof v === 'boolean') return v ? 'On' : 'Off';
  if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? '' : 's'}`;
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function Media({ gen, index }: { gen: Generation; index: number }) {
  const file = gen.files[index];
  if (gen.status === 'failed') {
    return (
      <div className="flex max-w-md flex-col items-center gap-3 px-6 text-center">
        <CircleAlert size={28} className="text-danger" />
        <p className="text-sm font-medium text-fg">Generation failed</p>
        <p className="text-[13px] leading-5 text-fg-muted">{gen.error}</p>
      </div>
    );
  }
  if (!file) {
    return (
      <div className="flex flex-col items-center gap-3 text-fg-muted">
        <Spinner size={22} className="text-accent" />
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
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="flex size-full items-center justify-center"
      >
        {file.type === 'video' ? (
          <video
            src={file.url}
            controls
            autoPlay
            loop
            playsInline
            className="max-h-full max-w-full rounded-sm object-contain"
          />
        ) : file.type === 'audio' ? (
          <audio src={file.url} controls className="w-full max-w-md" />
        ) : (
          <img src={file.url} alt={gen.prompt} className="max-h-full max-w-full rounded-sm object-contain" />
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="border-t border-line px-5 py-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-2xs font-medium tracking-wide text-fg-subtle uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Lightbox() {
  const id = useUI((s) => s.lightboxId);
  const open = useUI((s) => s.openLightbox);
  const items = useGallery((s) => s.items);
  const filter = useGallery((s) => s.filter);
  const remove = useGallery((s) => s.remove);
  const [fileIndex, setFileIndex] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const list = useMemo(() => (filter === 'all' ? items : items.filter((g) => g.category === filter)), [items, filter]);
  const pos = list.findIndex((g) => g.id === id);
  const gen = pos >= 0 ? list[pos] : items.find((g) => g.id === id);

  useEffect(() => {
    setFileIndex(0);
    setConfirmDelete(false);
  }, [id]);

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
      if (e.key === 'ArrowRight') go(1);
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
        return !(f && isMediaField(k, f)) && v !== undefined;
      })
    : [];
  const refs = gen
    ? Object.entries(gen.input).flatMap(([k, v]) => {
        const f = found?.variant.schema.properties[k];
        if (!(f ? isMediaField(k, f) : /_urls?$/.test(k))) return [];
        return (Array.isArray(v) ? v : [v]).filter((u): u is string => typeof u === 'string').map((u) => ({ field: k, url: u }));
      })
    : [];

  const file = gen?.files[fileIndex];
  const charged = gen && gen.credits != null && (gen.credits > 0 || gen.status === 'finished') ? gen.credits : undefined;
  const usd = charged != null ? charged * config.provider.creditUSD : undefined;

  return (
    <Dialog open={Boolean(gen)} onClose={close} title={gen ? `${gen.modelName}: ${gen.prompt}` : 'Details'} hideHeader size="full" mobile="full">
      {gen && (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto md:grid md:grid-cols-[minmax(0,1fr)_380px] md:overflow-hidden">
          {/* Media stage */}
          <div className="relative flex h-[58dvh] flex-col bg-bg-subtle md:h-auto md:min-h-0">
            <div className="flex min-h-0 flex-1 items-center justify-center p-4 sm:p-8">
              <Media gen={gen} index={fileIndex} />
            </div>
            {gen.files.length > 1 && (
              <div className="no-scrollbar flex justify-center gap-2 overflow-x-auto px-4 pb-4">
                {gen.files.map((f, i) => (
                  <button
                    key={f.url + i}
                    type="button"
                    aria-label={`Show output ${i + 1}`}
                    aria-current={i === fileIndex}
                    onClick={() => setFileIndex(i)}
                    className={cn(
                      'size-14 shrink-0 overflow-hidden rounded-sm ring-2 transition-all',
                      i === fileIndex ? 'ring-accent' : 'opacity-60 ring-transparent hover:opacity-100',
                    )}
                  >
                    <img src={f.url} alt="" className="size-full object-cover" />
                  </button>
                ))}
              </div>
            )}
            {pos > 0 && (
              <button
                type="button"
                aria-label="Previous"
                onClick={() => go(-1)}
                className="glass absolute top-1/2 left-3 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-line text-fg-muted transition-colors hover:text-fg"
              >
                <ChevronLeft size={18} />
              </button>
            )}
            {pos >= 0 && pos < list.length - 1 && (
              <button
                type="button"
                aria-label="Next"
                onClick={() => go(1)}
                className="glass absolute top-1/2 right-3 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-line text-fg-muted transition-colors hover:text-fg"
              >
                <ChevronRight size={18} />
              </button>
            )}
            <button
              type="button"
              aria-label="Close"
              data-autofocus
              onClick={close}
              className="glass absolute top-3 left-3 inline-flex size-9 items-center justify-center rounded-full border border-line text-fg-muted transition-colors hover:text-fg md:hidden"
            >
              <X size={17} />
            </button>
          </div>

          {/* Details */}
          <aside className="thin-scrollbar flex flex-col border-line pb-[env(safe-area-inset-bottom)] md:min-h-0 md:overflow-y-auto md:border-l">
            <div className="flex items-start gap-3 px-5 pt-5 pb-4">
              <ModelThumb model={model} className="size-10 rounded-sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-fg">{gen.modelName}</div>
                <div className="mt-0.5 truncate text-xs text-fg-subtle">
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
                className="-mt-1 -mr-1 hidden size-8 items-center justify-center rounded-sm text-fg-muted hover:bg-surface-2 hover:text-fg md:inline-flex"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 px-5 pb-4">
              {gen.status === 'failed' ? (
                <Button variant="primary" size="sm" icon={<RotateCcw size={14} />} onClick={() => void retry(gen.id)}>
                  Retry
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!file}
                  icon={<Download size={14} />}
                  onClick={() => file && void downloadFile(file.url, gen)}
                >
                  Download
                </Button>
              )}
              <Button
                size="sm"
                icon={<Wand2 size={14} />}
                onClick={() => {
                  reuse(gen);
                  close();
                  toast.success('Settings loaded into the composer');
                  requestAnimationFrame(focusPrompt);
                }}
              >
                Reuse settings
              </Button>
            </div>

            <Section
              title="Prompt"
              action={
                gen.prompt ? (
                  <button
                    type="button"
                    onClick={() => void copyText(gen.prompt, 'Prompt copied')}
                    className="inline-flex items-center gap-1 rounded-xs text-2xs text-fg-muted hover:text-fg"
                  >
                    <Copy size={12} /> Copy
                  </button>
                ) : null
              }
            >
              <p className="text-[13px] leading-[20px] whitespace-pre-wrap text-fg">{gen.prompt || '—'}</p>
            </Section>

            {(params.length > 0 || refs.length > 0) && (
              <Section title="Settings">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                  {params.map(([k, v]) => (
                    <div key={k} className="min-w-0">
                      <dt className="text-2xs text-fg-subtle">{humanize(k)}</dt>
                      <dd className="truncate font-mono text-xs text-fg" title={formatValue(v, k)}>
                        {formatValue(v, k)}
                      </dd>
                    </div>
                  ))}
                </dl>
                {refs.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {refs.map((r, i) => (
                      <a
                        key={r.url + i}
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        title={humanize(r.field)}
                        className="size-11 overflow-hidden rounded-xs bg-surface-3 ring-1 ring-line"
                      >
                        {/video/.test(r.field) ? (
                          <video src={r.url} muted preload="metadata" className="size-full object-cover" />
                        ) : (
                          <img src={r.url} alt={humanize(r.field)} className="size-full object-cover" />
                        )}
                      </a>
                    ))}
                  </div>
                )}
              </Section>
            )}

            <Section title="Cost">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] text-fg">
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
                  <span className="truncate font-mono text-2xs text-fg-subtle" title="Task ID">
                    {gen.taskId}
                  </span>
                )}
              </div>
            </Section>

            <Section title="Copy as code">
              <CodeTabs baseUrl={gen.apiBase} model={gen.variant} input={gen.input} />
              {found?.variant.docUrl && (
                <a
                  href={found.variant.docUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-2xs text-fg-muted hover:text-fg"
                >
                  API reference for {gen.variant} <ArrowUpRight size={11} />
                </a>
              )}
            </Section>

            <div className="mt-auto flex items-center justify-between gap-2 border-t border-line px-5 py-3">
              <span className="text-2xs text-fg-subtle">
                {pos >= 0 ? `${pos + 1} of ${list.length}` : ''} {pos >= 0 && '· ← → to browse'}
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
