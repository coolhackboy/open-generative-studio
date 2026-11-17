import { models } from '../data/catalog';
import type { CatalogModel, Example, Variant } from '../types/catalog';
import { getMediaFields } from './schema';

export interface Preset {
  key: string;
  model: CatalogModel;
  variant: Variant;
  example: Example;
  prompt: string;
}

/** Prompts that only make sense with media we don't have, scripts, or truncated text. */
const NEEDS_MEDIA = /\b(this|these|attached|uploaded|provided|given|reference|logo|first image|second image|input image|source image|the image|the photo|the video)\b|@(image|video|audio|element)\d*/i;
const SCRIPTY = /\n|\b\d+\s*[-–]\s*\d+\s*s\b|shot\s*\d|scene\s*\d|^\s*[[{]/i;

function words(s: string): Set<string> {
  return new Set(s.toLowerCase().match(/[a-z]{3,}/g) ?? []);
}

function similar(a: Set<string>, b: Set<string>): boolean {
  let inter = 0;
  a.forEach((w) => b.has(w) && inter++);
  return inter / (a.size + b.size - inter || 1) > 0.55;
}

function usable(prompt: string): boolean {
  const p = prompt.trim();
  if (p.length < 16 || p.length > 240) return false;
  if (NEEDS_MEDIA.test(p) || SCRIPTY.test(p)) return false;
  if (/example\.(com|org|net)/i.test(p)) return false;
  return /[.!?a-z0-9)"”]$/i.test(p);
}

let cache: Preset[] | null = null;

/** Prompt-only examples from the catalog, one per model, featured first, deduplicated. */
export function getPresets(): Preset[] {
  if (cache) return cache;
  const ranked = [...models].sort((a, b) => Number(!!b.featured) - Number(!!a.featured) || a.order - b.order);
  const out: Preset[] = [];
  const seen: Set<string>[] = [];
  for (const model of ranked) {
    for (const variant of model.variants) {
      if (getMediaFields(variant, model.category).some((f) => f.required)) continue;
      const example = variant.examples.find(
        (e) => typeof e.input.prompt === 'string' && usable(e.input.prompt) && !/example\.(com|org|net)/i.test(JSON.stringify(e.input)),
      );
      if (!example) continue;
      const prompt = String(example.input.prompt).trim();
      const w = words(prompt);
      if (seen.some((s) => similar(s, w))) continue;
      seen.push(w);
      out.push({ key: `${variant.model}:${example.name}`, model, variant, example, prompt });
      break;
    }
  }
  cache = out;
  return out;
}
