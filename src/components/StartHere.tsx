import { motion } from 'motion/react';
import { ArrowRight, Film, Image as ImageIcon } from 'lucide-react';
import { useMemo } from 'react';
import { models } from '../data/catalog';
import { getMediaFields } from '../lib/schema';
import { focusPrompt, useComposer } from '../lib/store';
import type { CatalogModel, Example, Variant } from '../types/catalog';
import { ModelThumb } from './ModelThumb';

interface Preset {
  key: string;
  model: CatalogModel;
  variant: Variant;
  example: Example;
}

const MAX = 12;

/** Pick one prompt-only example per model, featured models first, alternating video / image. */
function buildPresets(): Preset[] {
  const ranked = [...models].sort((a, b) => Number(!!b.featured) - Number(!!a.featured) || a.order - b.order);
  const byCat: Record<string, Preset[]> = { video: [], image: [] };
  const seen = new Set<string>();
  for (const model of ranked) {
    for (const variant of model.variants) {
      const needsMedia = getMediaFields(variant, model.category).some((f) => f.required);
      if (needsMedia) continue;
      const example = variant.examples.find(
        (e) =>
          typeof e.input.prompt === 'string' &&
          e.input.prompt.length > 12 &&
          !/example\.(com|org|net)/i.test(JSON.stringify(e.input)),
      );
      if (!example || seen.has(String(example.input.prompt))) continue;
      seen.add(String(example.input.prompt));
      byCat[model.category]?.push({ key: `${variant.model}:${example.name}`, model, variant, example });
      break;
    }
  }
  const out: Preset[] = [];
  for (let i = 0; out.length < MAX && (i < byCat.video.length || i < byCat.image.length); i++) {
    if (byCat.video[i]) out.push(byCat.video[i]);
    if (byCat.image[i] && out.length < MAX) out.push(byCat.image[i]);
  }
  return out;
}

export function StartHere() {
  const presets = useMemo(buildPresets, []);
  const applyPreset = useComposer((s) => s.applyPreset);

  if (presets.length === 0) return null;

  return (
    <section aria-labelledby="start-title" className="mt-10">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 id="start-title" className="text-[15px] font-semibold tracking-[-0.01em] text-fg">
            Start with an example
          </h2>
          <p className="mt-1 text-[13px] text-fg-muted">
            Load a model with a ready-made prompt and settings. Cover art shows the model — not the output of this prompt.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {presets.map((p, i) => {
          const Icon = p.model.category === 'video' ? Film : ImageIcon;
          return (
            <motion.button
              key={p.key}
              type="button"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.035, 0.3), duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              onClick={() => {
                applyPreset({ modelId: p.model.id, variant: p.variant.model, input: p.example.input });
                requestAnimationFrame(focusPrompt);
              }}
              className="group relative aspect-[4/3] overflow-hidden rounded-md bg-surface text-left ring-1 ring-line transition-shadow hover:ring-line-strong"
            >
              <ModelThumb
                model={p.model}
                className="absolute inset-0 size-full transition-transform duration-700 ease-out-soft group-hover:scale-[1.04]"
              />
              <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/0" />
              <span className="absolute inset-x-0 top-0 flex items-center gap-1.5 p-2.5">
                <span className="inline-flex items-center gap-1 rounded-xs bg-black/45 px-1.5 py-0.5 text-2xs font-medium text-white/90 backdrop-blur-md">
                  <Icon size={11} />
                  {p.model.name}
                </span>
              </span>
              <span className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-3">
                <span className="text-2xs font-medium tracking-wide text-white/55 uppercase">Example prompt</span>
                <span className="line-clamp-3 text-[13px] leading-[18px] text-white/90">{String(p.example.input.prompt)}</span>
                <span className="inline-flex items-center gap-1 text-2xs font-medium text-white/60 transition-colors group-hover:text-white">
                  Try it
                  <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </span>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}
