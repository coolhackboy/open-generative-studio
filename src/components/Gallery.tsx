import { AnimatePresence, motion } from 'motion/react';
import { Download, ImageOff, Trash2, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { MOCK_MODE } from '../lib/api';
import { downloadFile } from '../lib/download';
import { modKey } from '../lib/format';
import { estimateAspect } from '../lib/schema';
import { useGallery, useSettings, type GalleryFilter } from '../lib/store';
import type { Generation } from '../lib/types';
import { Button, Masonry, Segmented, toast, useEscapeLayer } from '../ui';
import { GenerationCard } from './GenerationCard';
import { KeyReminder } from './Onboarding';
import { Inspiration, ShowcaseHero } from './Showcase';

const getKey = (g: Generation) => g.id;
const getAspect = (g: Generation) =>
  // Failed cards hold only text: keep them compact regardless of the requested ratio.
  g.status === 'failed' ? Math.max(3 / 2, g.aspect ?? 0) : (g.aspect ?? estimateAspect(g.category, g.input));

const dayKey = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

function dayLabel(ts: number): string {
  const now = new Date();
  const d = new Date(ts);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en', {
    weekday: diff < 7 ? 'long' : undefined,
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

function BulkBar() {
  const items = useGallery((s) => s.items);
  const selected = useGallery((s) => s.selected);
  const clear = useGallery((s) => s.clearSelection);
  const removeMany = useGallery((s) => s.removeMany);
  const [confirm, setConfirm] = useState(false);
  useEscapeLayer(selected.length > 0, clear);

  const chosen = items.filter((g) => selected.includes(g.id));
  const files = chosen.flatMap((g) => g.files.map((f) => ({ f, g })));

  return (
    <AnimatePresence>
      {selected.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
          role="toolbar"
          aria-label="Selection"
          className="glass sticky top-16 z-20 flex items-center gap-2 rounded-md border border-line-strong px-3 py-2 shadow-md"
        >
          <span className="text-sm font-medium text-fg">{selected.length} selected</span>
          <span className="hidden text-xs text-fg-subtle sm:inline">· shift-click to select a range · Esc to clear</span>
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              size="sm"
              icon={<Download size={14} />}
              disabled={files.length === 0}
              onClick={async () => {
                for (const { f, g } of files) await downloadFile(f.url, g);
                toast.success(`Downloading ${files.length} file${files.length === 1 ? '' : 's'}`);
              }}
            >
              Download
            </Button>
            <Button
              size="sm"
              variant={confirm ? 'danger' : 'ghost'}
              icon={<Trash2 size={14} />}
              onBlur={() => setConfirm(false)}
              onClick={() => {
                if (!confirm) return setConfirm(true);
                removeMany(selected);
                setConfirm(false);
                toast.success(`Deleted ${selected.length} from this browser`);
              }}
            >
              {confirm ? `Delete ${selected.length}?` : 'Delete'}
            </Button>
            <button
              type="button"
              aria-label="Clear selection"
              onClick={clear}
              className="inline-flex size-8 items-center justify-center rounded-sm text-fg-muted hover:bg-surface-2 hover:text-fg"
            >
              <X size={15} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Gallery() {
  const items = useGallery((s) => s.items);
  const loaded = useGallery((s) => s.loaded);
  const filter = useGallery((s) => s.filter);
  const setFilter = useGallery((s) => s.setFilter);
  const hasKey = useSettings((s) => Boolean(s.apiKey));

  const visible = useMemo(
    () => (filter === 'all' ? items : items.filter((g) => g.category === filter)),
    [items, filter],
  );
  const visibleIds = useMemo(() => visible.map((g) => g.id), [visible]);
  const groups = useMemo(() => {
    const out: { key: string; label: string; items: Generation[] }[] = [];
    for (const g of visible) {
      const k = dayKey(g.createdAt);
      const last = out[out.length - 1];
      if (last?.key === k) last.items.push(g);
      else out.push({ key: k, label: dayLabel(g.createdAt), items: [g] });
    }
    return out;
  }, [visible]);
  const renderCard = useCallback(
    (g: Generation, size: { width: number; height: number }) => <GenerationCard gen={g} size={size} visibleIds={visibleIds} />,
    [visibleIds],
  );
  const counts = useMemo(
    () => ({
      all: items.length,
      image: items.filter((g) => g.category === 'image').length,
      video: items.filter((g) => g.category === 'video').length,
    }),
    [items],
  );

  if (!loaded) return <div className="min-h-[60dvh]" aria-busy="true" />;

  if (items.length === 0) {
    return (
      // Full-bleed: break out of the max-width container on wide screens.
      <div className="relative left-1/2 -mt-2 w-screen -translate-x-1/2">
        <ShowcaseHero />
      </div>
    );
  }

  const label = (text: string, n: number) => (
    <>
      {text}
      <span className="font-mono text-xs text-fg-muted tabular-nums">{n}</span>
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      {!hasKey && !MOCK_MODE && <KeyReminder />}
      <div className="flex items-center justify-between gap-3">
        <h1 className="sr-only">Your gallery</h1>
        <Segmented<GalleryFilter>
          label="Filter gallery"
          size="sm"
          className="max-sm:[&_[role=radio]]:h-9"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: label('All', counts.all), title: 'All' },
            { value: 'image', label: label('Images', counts.image), title: 'Images' },
            { value: 'video', label: label('Videos', counts.video), title: 'Videos' },
          ]}
        />
        <span className="hidden text-xs text-fg-subtle lg:block">
          Stored locally in this browser · shift / {modKey}-click to select
        </span>
      </div>
      <BulkBar />
      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-24 text-center text-fg-subtle">
          <ImageOff size={22} />
          <p className="text-sm">No {filter === 'image' ? 'images' : 'videos'} yet.</p>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.key} aria-label={group.label}>
            <h2 className="sticky top-14 z-10 -mx-1 mb-2 bg-[linear-gradient(to_bottom,var(--bg)_70%,transparent)] px-1 pt-1 pb-2 text-sm font-medium text-fg-muted">
              {group.label}
              <span className="ml-2 font-mono text-xs text-fg-subtle">{group.items.length}</span>
            </h2>
            <Masonry items={group.items} getKey={getKey} getAspect={getAspect} render={renderCard} gap={10} />
          </section>
        ))
      )}
      {items.length < 8 && <Inspiration />}
    </div>
  );
}
