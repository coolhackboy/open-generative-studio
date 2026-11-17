import { Check, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { config } from '../config';
import { models } from '../data/catalog';
import { startingPriceLabel } from '../lib/cost';
import { focusPrompt, useComposer, useUI } from '../lib/store';
import type { CatalogModel, Category } from '../types/catalog';
import { cn, Dialog, Kbd, Segmented } from '../ui';
import { ModelThumb } from './ModelThumb';

type Tab = 'all' | Category;

function haystack(m: CatalogModel): string {
  return [m.name, m.provider, m.id, m.category, ...m.tasks, ...m.variants.map((v) => `${v.label} ${v.model}`)]
    .join(' ')
    .toLowerCase();
}

export function ModelPalette() {
  const open = useUI((s) => s.paletteOpen);
  const setOpen = useUI((s) => s.setPaletteOpen);
  const currentId = useComposer((s) => s.modelId);
  const setModel = useComposer((s) => s.setModel);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const index = useMemo(() => models.map((m) => ({ m, text: haystack(m), price: startingPriceLabel(m) })), []);

  const results = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const rows = index.filter(({ m, text }) => (tab === 'all' || m.category === tab) && terms.every((t) => text.includes(t)));
    // Group: video first, then image (catalog order within each).
    return [...rows.filter((r) => r.m.category === 'video'), ...rows.filter((r) => r.m.category === 'image')];
  }, [index, query, tab]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const i = results.findIndex((r) => r.m.id === currentId);
    setActive(Math.max(0, i));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (m: CatalogModel) => {
    setModel(m.id);
    setOpen(false);
    requestAnimationFrame(focusPrompt);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[active];
      if (r) choose(r.m);
    }
  };

  const counts = { video: results.filter((r) => r.m.category === 'video').length };

  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Choose a model" hideHeader size="lg" mobile="full">
      <div className="flex min-h-0 flex-1 flex-col" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={17} className="shrink-0 text-fg-subtle" />
          <input
            data-autofocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder="Search models, providers, tasks…"
            aria-label="Search models"
            role="combobox"
            aria-expanded="true"
            aria-controls="model-listbox"
            aria-activedescendant={results[active] ? `model-opt-${results[active].m.id}` : undefined}
            className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-subtle focus-visible:outline-none"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="hidden sm:block"
            aria-label="Close"
          >
            <Kbd>Esc</Kbd>
          </button>
          <button type="button" onClick={() => setOpen(false)} className="text-sm text-fg-muted sm:hidden">
            Cancel
          </button>
        </div>
        <div className="flex items-center justify-between gap-2 px-4 py-2.5">
          <Segmented<Tab>
            label="Category"
            size="sm"
            value={tab}
            onChange={(t) => {
              setTab(t);
              setActive(0);
            }}
            options={[
              { value: 'all', label: 'All' },
              { value: 'video', label: 'Video' },
              { value: 'image', label: 'Image' },
            ]}
          />
          <span className="font-mono text-2xs text-fg-subtle">{results.length} models</span>
        </div>

        <div
          ref={listRef}
          id="model-listbox"
          role="listbox"
          aria-label="Models"
          tabIndex={-1}
          className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2 sm:max-h-[min(60dvh,560px)]"
        >
          {results.length === 0 && (
            <div className="py-16 text-center text-sm text-fg-subtle">No models match “{query}”.</div>
          )}
          {results.map((r, i) => {
            const header =
              i === 0 || results[i - 1].m.category !== r.m.category ? (
                <div className="sticky top-0 z-10 bg-surface px-2 pt-3 pb-1.5 text-2xs font-medium tracking-wide text-fg-subtle uppercase">
                  {r.m.category === 'video' ? `Video · ${counts.video}` : `Image · ${results.length - counts.video}`}
                </div>
              ) : null;
            const selected = r.m.id === currentId;
            return (
              <div key={r.m.id}>
                {header}
                <div
                  id={`model-opt-${r.m.id}`}
                  role="option"
                  aria-selected={i === active}
                  data-index={i}
                  onMouseMove={() => i !== active && setActive(i)}
                  onClick={() => choose(r.m)}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-sm px-2 py-2 transition-colors',
                    i === active ? 'bg-surface-2' : 'hover:bg-surface-2/60',
                  )}
                >
                  <ModelThumb model={r.m} className="h-10 w-16 rounded-xs" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-fg">{r.m.name}</span>
                      {r.m.isNew && (
                        <span className="rounded-xs bg-accent-soft px-1.5 py-px text-[10px] font-semibold tracking-wide text-accent uppercase">
                          New
                        </span>
                      )}
                      {selected && <Check size={14} className="shrink-0 text-accent" aria-label="Current model" />}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-fg-subtle">
                      {r.m.provider}
                      {r.m.tasks.length > 0 && ` · ${r.m.tasks.slice(0, 3).join(', ')}`}
                      {r.m.variants.length > 1 && ` · ${r.m.variants.length} variants`}
                    </div>
                  </div>
                  {r.price && (
                    <span className="hidden shrink-0 font-mono text-xs text-fg-muted tabular-nums sm:block">{r.price}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="hidden items-center gap-4 border-t border-line px-4 py-2.5 text-2xs text-fg-subtle sm:flex">
          <span className="inline-flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>↵</Kbd> select
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>Esc</Kbd> close
          </span>
          <span className="ml-auto">Prices are indicative; {config.provider.name} bills the final amount.</span>
        </div>
      </div>
    </Dialog>
  );
}
