import { motion, useInView, useReducedMotion } from 'motion/react';
import { ArrowRight, ArrowUpRight, FlaskConical, KeyRound, Sparkles, Star } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { config } from '../config';
import { catalog, getModel, getVariant } from '../data/catalog';
import { MOCK_MODE } from '../lib/api';
import { formatUSD } from '../lib/cost';
import { focusPrompt, useComposer, useSettings, useUI } from '../lib/store';
import { hasKnownInput, useShowcase, type ShowcaseItem } from '../lib/showcase';
import { seedDemo } from '../lib/tasks';
import { cn } from '../ui';
import { GitHubIcon } from './Brand';

/** Load a showcase item into the composer: exact settings when known, otherwise just the model. */
function useItem(item: ShowcaseItem) {
  const applyPreset = useComposer((s) => s.applyPreset);
  const setModel = useComposer((s) => s.setModel);
  return () => {
    const model = getModel(item.model);
    if (!model) return;
    if (hasKnownInput(item)) applyPreset({ modelId: model.id, variant: item.variant, input: item.input });
    else setModel(model.id);
    requestAnimationFrame(focusPrompt);
  };
}

/** Image or lazily-loaded looping video; only plays while on screen (and never under reduced motion). */
const TileMedia = memo(function TileMedia({ item, eager }: { item: ShowcaseItem; eager?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const near = useInView(ref, { margin: '300px 0px' });
  const visible = useInView(ref, { amount: 0.2 });
  const reduce = useReducedMotion();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (visible && !reduce) void v.play().catch(() => undefined);
    else v.pause();
  }, [visible, reduce, near]);

  const still = item.type === 'video' ? item.poster : item.src;
  return (
    <div ref={ref} className="absolute inset-0 bg-surface-2">
      {still && (
        <img
          src={still}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setLoaded(true)}
          className={cn('absolute inset-0 size-full object-cover transition-opacity duration-500', loaded ? 'opacity-100' : 'opacity-0')}
        />
      )}
      {item.type === 'video' && (near || visible) && !reduce && (
        <video
          ref={videoRef}
          src={item.src}
          poster={item.poster}
          muted
          loop
          playsInline
          preload="none"
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </div>
  );
});

function TileInfo({ item }: { item: ShowcaseItem }) {
  const model = getModel(item.model);
  const known = hasKnownInput(item);
  const variant = model ? getVariant(model, item.variant) : undefined;
  const cost = known && item.credits ? formatUSD(item.credits * config.provider.creditUSD) : null;
  return (
    <span className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/85 via-black/35 to-transparent p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100">
      {known ? (
        <span className="line-clamp-3 text-sm text-white/95">{String(item.input.prompt)}</span>
      ) : (
        <span className="text-sm font-medium text-white/95">Sample output</span>
      )}
      <span className="mt-1.5 flex items-center gap-2 text-xs text-white/70">
        <span className="truncate">
          {model?.name ?? item.model}
          {known && variant && model && model.variants.length > 1 ? ` · ${variant.label}` : ''}
        </span>
        {cost && <span className="shrink-0 font-mono text-white/80">{cost} charged</span>}
      </span>
      <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#c6f76a]">
        {known ? 'Use this prompt' : `Try ${model?.name ?? 'this model'}`}
        <ArrowRight size={12} />
      </span>
    </span>
  );
}

export function ShowcaseTile({ item, className, eager }: { item: ShowcaseItem; className?: string; eager?: boolean }) {
  const use = useItem(item);
  const model = getModel(item.model);
  const known = hasKnownInput(item);
  return (
    <button
      type="button"
      onClick={use}
      aria-label={`${known ? 'Use this prompt' : 'Try model'}: ${model?.name ?? item.model}. ${item.alt}`}
      className={cn(
        'group relative block w-full overflow-hidden rounded-md bg-surface-2 text-left ring-1 ring-line outline-offset-2',
        className,
      )}
      style={{ aspectRatio: String(item.aspect) }}
    >
      <TileMedia item={item} eager={eager} />
      <TileInfo item={item} />
    </button>
  );
}

/** Distribute items into columns by height so columns stay balanced. */
function columnsOf(items: ShowcaseItem[], n: number): ShowcaseItem[][] {
  const cols: ShowcaseItem[][] = Array.from({ length: n }, () => []);
  const heights = new Array<number>(n).fill(0);
  for (const it of items) {
    let c = 0;
    for (let i = 1; i < n; i++) if (heights[i] < heights[c]) c = i;
    cols[c].push(it);
    heights[c] += 1 / Math.max(0.4, it.aspect);
  }
  return cols;
}

function Wall({ items }: { items: ShowcaseItem[] }) {
  const reduce = useReducedMotion();
  const cols = useMemo(() => columnsOf(items, 5), [items]);
  return (
    <div className="group/wall absolute inset-0 grid grid-cols-5 gap-2.5 overflow-hidden px-2.5" aria-hidden="false">
      {cols.map((col, i) => (
        <div key={i} className="relative overflow-hidden">
          <div
            className={cn('flex flex-col gap-2.5', !reduce && 'group-hover/wall:[animation-play-state:paused]')}
            style={
              reduce
                ? { transform: `translateY(-${(i % 2) * 12}%)` }
                : {
                    animation: `wall-scroll ${70 + i * 9}s linear infinite`,
                    animationDirection: i % 2 ? 'reverse' : 'normal',
                  }
            }
          >
            {[...col, ...col].map((it, k) => (
              <ShowcaseTile key={`${it.id}-${k}`} item={it} eager={k < 3} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Carousel({ items }: { items: ShowcaseItem[] }) {
  return (
    <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-2" aria-label="Showcase">
      {items.slice(0, 16).map((it, i) => (
        <div key={it.id} className="w-[72vw] max-w-[320px] shrink-0 snap-start">
          <ShowcaseTile item={{ ...it, aspect: 4 / 5 }} eager={i < 2} />
        </div>
      ))}
    </div>
  );
}

function Ctas() {
  const hasKey = useSettings((s) => Boolean(s.apiKey));
  const openSettings = useUI((s) => s.setSettingsOpen);
  return (
    <div className="flex flex-wrap items-center justify-center gap-2.5">
      {hasKey || MOCK_MODE ? (
        <button
          type="button"
          onClick={focusPrompt}
          className="inline-flex h-11 items-center gap-2 rounded-md bg-accent px-5 text-base font-medium text-accent-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.3)] transition-colors hover:bg-accent-hover"
        >
          <Sparkles size={17} />
          Start creating
        </button>
      ) : (
        <button
          type="button"
          onClick={() => openSettings(true)}
          className="inline-flex h-11 items-center gap-2 rounded-md bg-accent px-5 text-base font-medium text-accent-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.3)] transition-colors hover:bg-accent-hover"
        >
          <KeyRound size={17} />
          Add your key — start creating
        </button>
      )}
      {!hasKey && !MOCK_MODE && (
        <a
          href={config.provider.onboardingKeyUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-11 items-center gap-1.5 rounded-md border border-line-strong bg-bg/60 px-4 text-base font-medium text-fg backdrop-blur-md transition-colors hover:bg-surface-2"
        >
          Get a key
          <ArrowUpRight size={16} className="text-fg-muted" />
        </a>
      )}
      <a
        href={config.repoUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-11 items-center gap-2 rounded-md border border-line-strong bg-bg/60 px-4 text-base font-medium text-fg backdrop-blur-md transition-colors hover:bg-surface-2"
      >
        <Star size={16} className="text-fg-muted" />
        Star on GitHub
      </a>
      {MOCK_MODE && (
        <button
          type="button"
          onClick={() => void seedDemo()}
          data-mock-badge
          className="inline-flex h-11 items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-4 text-sm font-medium text-warning"
        >
          <FlaskConical size={15} />
          Load demo gallery
        </button>
      )}
    </div>
  );
}

const modelCount = () => catalog.models.filter((m) => m.variants.length > 0).length;

function HeroCopy({ compact }: { compact?: boolean }) {
  return (
    <div className="flex flex-col items-center text-center">
      <p className="label mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-bg/70 px-3 py-1 text-fg-muted backdrop-blur-md">
        <GitHubIcon size={13} />
        Open source · MIT · {modelCount()} models
      </p>
      <h1
        className={cn(
          'max-w-[16ch] font-semibold tracking-[-0.035em] text-balance text-fg',
          compact ? 'text-display-sm' : 'text-display-sm md:text-display',
        )}
      >
        Every frontier image &amp; video model. One prompt box.
      </h1>
      <p className="mt-4 max-w-[46ch] text-[17px] leading-7 text-pretty text-fg-muted">
        Seedance, Kling, Veo, Sora, FLUX, Nano Banana, GPT Image — in a studio that runs in your browser with your own{' '}
        {config.provider.name} key.
      </p>
      <div className="mt-7">
        <Ctas />
      </div>
    </div>
  );
}

/** First screen: a live wall of real outputs behind the pitch. */
export function ShowcaseHero() {
  const items = useShowcase((s) => s.items);
  const status = useShowcase((s) => s.status);
  const load = useShowcase((s) => s.load);
  useEffect(() => void load(), [load]);

  return (
    <section aria-labelledby="hero-title" className="relative">
      {/* Desktop wall */}
      <div className="relative hidden h-[calc(100dvh-56px)] min-h-[620px] overflow-hidden md:block">
        {items.length > 0 && <Wall items={items} />}
        {status !== 'ready' && <div className="shimmer absolute inset-0" />}
        {/* Fade band holding the copy */}
        <div className="pointer-events-none absolute inset-0 bg-[color-mix(in_oklab,var(--bg)_42%,transparent)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,var(--bg)_0%,transparent_16%,transparent_66%,var(--bg)_100%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-[360px] -translate-y-[58%] bg-[radial-gradient(52%_62%_at_50%_50%,var(--bg)_42%,color-mix(in_oklab,var(--bg)_86%,transparent)_62%,transparent_100%)]" />
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          id="hero-title"
          className="pointer-events-auto absolute inset-x-0 top-1/2 mx-auto w-fit -translate-y-[58%] px-6 [&_a]:pointer-events-auto [&_button]:pointer-events-auto"
        >
          <HeroCopy />
        </motion.div>
      </div>

      {/* Mobile: copy then a swipeable carousel */}
      <div className="glow px-4 pt-8 pb-4 md:hidden" id="hero-title-mobile">
        <HeroCopy compact />
        <div className="mt-8">{items.length > 0 ? <Carousel items={items} /> : <div className="shimmer h-80 rounded-md" />}</div>
      </div>
    </section>
  );
}

/** Below a small gallery: a strip of real outputs to borrow ideas from. */
export function Inspiration() {
  const items = useShowcase((s) => s.items);
  const load = useShowcase((s) => s.load);
  useEffect(() => void load(), [load]);
  const picks = useMemo(() => items.filter((x) => x.aspect > 1.2).slice(0, 10), [items]);
  if (picks.length === 0) return null;
  return (
    <section aria-labelledby="inspiration-title" className="mt-12">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2 id="inspiration-title" className="text-base font-semibold text-fg">
            Inspiration
          </h2>
          <p className="mt-0.5 text-sm text-fg-subtle">Real outputs from models in the catalog. Click one to try it.</p>
        </div>
      </div>
      <div className="no-scrollbar -mx-3 flex snap-x gap-2.5 overflow-x-auto px-3 pb-2 sm:-mx-6 sm:px-6">
        {picks.map((it) => (
          <div key={it.id} className="w-[280px] shrink-0 snap-start sm:w-[320px]">
            <ShowcaseTile item={it} />
          </div>
        ))}
      </div>
    </section>
  );
}
