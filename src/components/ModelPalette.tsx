import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, Check, Search } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { config } from '../config';
import { getVariant, models } from '../data/catalog';
import { formatUSD, startingPriceLabel, unitSuffix } from '../lib/cost';
import { modKey } from '../lib/format';
import { getMediaFields, getParamFields } from '../lib/schema';
import { buildIndex, searchModels } from '../lib/search';
import { useShowcase } from '../lib/showcase';
import { focusPrompt, useComposer, useUI } from '../lib/store';
import type { CatalogModel, Category } from '../types/catalog';
import { cn, Dialog, Kbd, Segmented } from '../ui';
import { ModelThumb } from './ModelThumb';

type Tab = 'all' | Category;
const TABS: Tab[] = ['all', 'video', 'image'];
const PAGE = 8;

interface Row {
  key: string;
  model: CatalogModel;
  nameMatches: number[];
  group: string;
}

function ProviderIcon({ model }: { model: CatalogModel }) {
  const [failed, setFailed] = useState(false);
  if (!model.icon || failed)
    return (
      <span className="flex size-6 shrink-0 items-center justify-center rounded-xs bg-surface-3 font-mono text-xs text-fg-muted">
        {model.provider.charAt(0)}
      </span>
    );
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-xs bg-white p-0.5 ring-1 ring-line">
      <img src={model.icon} alt="" width={20} height={20} loading="lazy" onError={() => setFailed(true)} className="size-5 object-contain" />
    </span>
  );
}

function Highlight({ text, matches }: { text: string; matches: number[] }) {
  if (!matches.length) return <>{text}</>;
  const set = new Set(matches);
  return (
    <>
      {[...text].map((ch, i) =>
        set.has(i) ? (
          <mark key={i} className="bg-transparent text-accent-ink underline decoration-accent/60 underline-offset-2">
            {ch}
          </mark>
        ) : (
          <Fragment key={i}>{ch}</Fragment>
        ),
      )}
    </>
  );
}

function limitsOf(model: CatalogModel): { label: string; value: string }[] {
  const v = getVariant(model);
  const out: { label: string; value: string }[] = [];
  const props = v.schema.properties;
  const d = props.duration;
  if (d?.minimum != null && d.maximum != null) out.push({ label: 'Duration', value: `${d.minimum}–${d.maximum}s` });
  else if (d?.enum) out.push({ label: 'Duration', value: d.enum.map((x) => `${x}s`).join(' · ') });
  const res = props.resolution?.enum ?? props.quality?.enum;
  if (res) out.push({ label: 'Resolution', value: res.join(' · ') });
  const ar = props.aspect_ratio?.enum ?? props.size?.enum;
  if (ar) out.push({ label: props.aspect_ratio ? 'Aspect' : 'Size', value: `${ar.length} options` });
  const n = props.n ?? props.num_images;
  if (n?.maximum != null) out.push({ label: 'Outputs', value: `up to ${n.maximum}` });
  for (const f of getMediaFields(v, model.category).slice(0, 3))
    out.push({ label: f.label, value: f.multiple ? `up to ${f.max}` : f.required ? 'required' : 'optional' });
  if (props.generate_audio || props.sound) out.push({ label: 'Audio', value: 'native' });
  return out.slice(0, 8);
}

function Preview({ model, onSelect }: { model: CatalogModel; onSelect: () => void }) {
  const reduce = useReducedMotion();
  const sample = useShowcase((s) => s.items.find((x) => x.model === model.id));
  const variant = getVariant(model);
  const tiers = variant.pricing.filter((t) => !t.appliesTo || t.appliesTo.includes(variant.model)).slice(0, 6);
  const limits = limitsOf(model);
  const params = getParamFields(variant).length;

  return (
    <motion.div
      key={model.id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.16 }}
      className="flex h-full min-h-0 flex-col"
    >
      <div className="relative aspect-video w-full shrink-0 overflow-hidden bg-surface-2">
        {sample?.type === 'video' && !reduce ? (
          <video
            key={sample.src}
            src={sample.src}
            poster={sample.poster}
            muted
            loop
            autoPlay
            playsInline
            preload="none"
            className="size-full object-cover"
          />
        ) : sample ? (
          <img src={sample.type === 'video' ? sample.poster : sample.src} alt="" className="size-full object-cover" />
        ) : (
          <ModelThumb model={model} className="size-full" />
        )}
        <span className="absolute bottom-2 left-2 rounded-xs bg-black/55 px-1.5 py-0.5 text-xs text-white/85 backdrop-blur-md">
          {sample ? 'Sample output' : 'Model cover'}
        </span>
      </div>
      <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-2">
        <div className="flex items-start gap-3">
          <ProviderIcon model={model} />
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold tracking-[-0.01em] text-fg">{model.name}</h3>
            <p className="text-sm text-fg-subtle">
              {model.provider} · {model.category === 'video' ? 'Video' : 'Image'}
              {model.variants.length > 1 && ` · ${model.variants.length} variants`}
            </p>
          </div>
        </div>
        <p className="mt-3 line-clamp-4 text-sm text-fg-muted">{model.description}</p>
        {model.tasks.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {model.tasks.map((t) => (
              <span key={t} className="rounded-xs border border-line px-1.5 py-0.5 text-xs text-fg-muted">
                {t}
              </span>
            ))}
          </div>
        )}
        {model.variants.length > 1 && (
          <div className="mt-4">
            <div className="label mb-1.5">Variants</div>
            <div className="flex flex-wrap gap-1.5">
              {model.variants.map((v) => (
                <span key={v.model} className="rounded-xs bg-surface-2 px-1.5 py-0.5 text-xs text-fg-muted">
                  {v.label}
                </span>
              ))}
            </div>
          </div>
        )}
        {limits.length > 0 && (
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
            {limits.map((l) => (
              <div key={l.label} className="min-w-0">
                <dt className="label">{l.label}</dt>
                <dd className="truncate text-sm text-fg">{l.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {tiers.length > 0 && (
          <div className="mt-4">
            <div className="label mb-1.5">Pricing{model.variants.length > 1 ? ` · ${variant.label}` : ''}</div>
            <table className="w-full text-sm">
              <tbody>
                {tiers.map((t, i) => (
                  <tr key={i} className="border-t border-line first:border-t-0">
                    <td className="py-1 pr-3 text-fg-muted">{t.spec || t.description || '—'}</td>
                    <td className="py-1 text-right font-mono text-fg tabular-nums">
                      {formatUSD(t.priceUSD)}
                      <span className="text-fg-subtle">{unitSuffix(t.unit)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-fg-subtle">{params} adjustable settings in the composer.</p>
      </div>
      <div className="flex items-center gap-2 border-t border-line px-5 py-3">
        <a
          href={`${model.pageUrl}?utm_source=open-generative-studio&utm_medium=app&utm_campaign=palette`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
        >
          Model page <ArrowUpRight size={13} />
        </a>
        <button
          type="button"
          onClick={onSelect}
          className="ml-auto inline-flex h-9 items-center gap-2 rounded-sm bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-accent-hover"
        >
          Select <Kbd className="border-black/15 bg-black/10 text-accent-fg">↵</Kbd>
        </button>
      </div>
    </motion.div>
  );
}

export function ModelPalette() {
  const open = useUI((s) => s.paletteOpen);
  const setOpen = useUI((s) => s.setPaletteOpen);
  const currentId = useComposer((s) => s.modelId);
  const setModel = useComposer((s) => s.setModel);
  const loadShowcase = useShowcase((s) => s.load);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const index = useMemo(() => buildIndex(models), []);
  const prices = useMemo(() => new Map(models.map((m) => [m.id, startingPriceLabel(m)])), []);

  const rows = useMemo<Row[]>(() => {
    const inTab = (m: CatalogModel) => tab === 'all' || m.category === tab;
    if (query.trim()) {
      return searchModels(index, query)
        .filter((h) => inTab(h.model))
        .map((h) => ({ key: h.model.id, model: h.model, nameMatches: h.nameMatches, group: 'Best matches' }));
    }
    const all = models.filter(inTab);
    const rec = all.filter((m) => m.featured).slice(0, 8);
    const mk = (m: CatalogModel, group: string, prefix: string): Row => ({ key: `${prefix}${m.id}`, model: m, nameMatches: [], group });
    return [
      ...rec.map((m) => mk(m, 'Recommended', 'rec:')),
      ...all.filter((m) => m.category === 'video').map((m) => mk(m, 'Video', '')),
      ...all.filter((m) => m.category === 'image').map((m) => mk(m, 'Image', '')),
    ];
  }, [index, query, tab]);

  const groupCounts = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of rows) c.set(r.group, (c.get(r.group) ?? 0) + 1);
    return c;
  }, [rows]);

  useEffect(() => {
    if (!open) return;
    void loadShowcase();
    setQuery('');
    setTab('all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const i = query ? 0 : rows.findIndex((r) => r.model.id === currentId && !r.key.startsWith('rec:'));
    setActive(Math.max(0, i));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, tab]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (m: CatalogModel) => {
    setModel(m.id);
    setOpen(false);
    requestAnimationFrame(focusPrompt);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const last = rows.length - 1;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && ['1', '2', '3'].includes(e.key)) {
      e.preventDefault();
      setTab(TABS[Number(e.key) - 1]);
      return;
    }
    const move: Record<string, number | undefined> = {
      ArrowDown: Math.min(last, active + 1),
      ArrowUp: Math.max(0, active - 1),
      PageDown: Math.min(last, active + PAGE),
      PageUp: Math.max(0, active - PAGE),
      Home: e.target === inputRef.current && query ? undefined : 0,
      End: e.target === inputRef.current && query ? undefined : last,
    };
    if (e.key in move && move[e.key] !== undefined) {
      e.preventDefault();
      setActive(move[e.key]!);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = rows[active];
      if (r) choose(r.model);
    }
  };

  const current = rows[active]?.model;

  let section: ReactNode = null;
  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Choose a model" hideHeader size="xl" mobile="full" className="sm:h-[min(600px,calc(100dvh-48px))]">
      <div className="flex min-h-0 flex-1 flex-col" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={17} className="shrink-0 text-fg-subtle" />
          <input
            ref={inputRef}
            data-autofocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search models, makers, tasks (i2v, edit)…"
            aria-label="Search models"
            role="combobox"
            aria-expanded="true"
            aria-controls="model-listbox"
            aria-activedescendant={rows[active] ? `model-opt-${rows[active].key}` : undefined}
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-subtle focus-visible:outline-none max-sm:text-[16px]"
          />
          <button type="button" onClick={() => setOpen(false)} className="hidden sm:block" aria-label="Close">
            <Kbd>Esc</Kbd>
          </button>
          <button type="button" onClick={() => setOpen(false)} className="h-11 px-1 text-sm text-fg-muted sm:hidden">
            Cancel
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* List */}
          <div className="flex min-h-0 w-full flex-col sm:w-[400px] sm:shrink-0 sm:border-r sm:border-line">
            <div className="flex items-center justify-between gap-2 px-3 py-2.5">
              <Segmented<Tab>
                label="Category"
                size="sm"
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'all', label: 'All', title: `All (${modKey}1)` },
                  { value: 'video', label: 'Video', title: `Video (${modKey}2)` },
                  { value: 'image', label: 'Image', title: `Image (${modKey}3)` },
                ]}
              />
              <span className="font-mono text-xs text-fg-subtle">{new Set(rows.map((r) => r.model.id)).size} models</span>
            </div>
            <div
              ref={listRef}
              id="model-listbox"
              role="listbox"
              aria-label="Models"
              tabIndex={-1}
              className="thin-scrollbar relative min-h-0 flex-1 overflow-y-auto px-2 pb-2"
            >
              {rows.length === 0 && (
                <div className="px-4 py-16 text-center text-sm text-fg-subtle">
                  No models match “{query}”.
                  <br />
                  Try a maker (ByteDance, Google) or a task (i2v, edit).
                </div>
              )}
              {rows.map((r, i) => {
                const header =
                  r.group !== section ? (
                    <div
                      role="presentation"
                      className="sticky top-0 z-10 flex items-center justify-between bg-surface/95 px-2 pt-3 pb-1.5 backdrop-blur-sm"
                    >
                      <span className="label text-fg-muted">{r.group}</span>
                      <span className="font-mono text-xs text-fg-subtle">{groupCounts.get(r.group)}</span>
                    </div>
                  ) : null;
                section = r.group;
                const selected = r.model.id === currentId;
                const price = prices.get(r.model.id);
                return (
                  <Fragment key={r.key}>
                    {header}
                    <div
                      id={`model-opt-${r.key}`}
                      role="option"
                      aria-selected={i === active}
                      data-index={i}
                      onMouseMove={() => i !== active && setActive(i)}
                      onClick={() => choose(r.model)}
                      className={cn(
                        'flex h-[52px] cursor-pointer items-center gap-3 rounded-sm px-2 transition-colors max-sm:h-14',
                        i === active ? 'bg-surface-2' : 'hover:bg-surface-2/60',
                      )}
                    >
                      <ProviderIcon model={r.model} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium text-fg">
                            <Highlight text={r.model.name} matches={r.nameMatches} />
                          </span>
                          {r.model.isNew && (
                            <span className="shrink-0 rounded-xs bg-accent-soft px-1 text-xs font-medium text-accent-ink">New</span>
                          )}
                          {selected && <Check size={14} className="shrink-0 text-accent-ink" aria-label="Current model" />}
                        </div>
                        <div className="truncate text-xs text-fg-subtle">
                          {r.model.provider}
                          {r.model.variants.length > 1 && ` · ${r.model.variants.length} variants`}
                        </div>
                      </div>
                      {price && <span className="shrink-0 font-mono text-xs text-fg-muted tabular-nums">{price}</span>}
                    </div>
                  </Fragment>
                );
              })}
            </div>
          </div>

          {/* Preview */}
          <div className="hidden min-h-0 flex-1 sm:block">
            <AnimatePresence mode="wait" initial={false}>
              {current && <Preview key={current.id} model={current} onSelect={() => choose(current)} />}
            </AnimatePresence>
          </div>
        </div>

        <div className="hidden items-center gap-4 border-t border-line px-4 py-2.5 text-xs text-fg-subtle sm:flex">
          <span className="inline-flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>↵</Kbd> select
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>{modKey}</Kbd>
            <Kbd>1–3</Kbd> tabs
          </span>
          <span className="ml-auto">Prices are indicative; {config.provider.name} bills the final amount.</span>
        </div>
      </div>
    </Dialog>
  );
}
