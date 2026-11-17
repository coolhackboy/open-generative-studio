import type { CatalogModel, PriceTier, Variant } from '../types/catalog';

/**
 * Thin, optional wrapper around `./pricing.ts` (generated alongside the catalog).
 * Loaded through `import.meta.glob` so the app still builds if pricing is absent;
 * every function then degrades to "no estimate".
 */

export interface CostEstimate {
  usd: number;
  credits: number;
  label: string;
}

interface PricingModule {
  estimateCost?: (variant: Variant, input: Record<string, unknown>) => CostEstimate | null;
  formatUSD?: (usd: number) => string;
  startingPrice?: (variant: Variant) => PriceTier | null;
}

const mods = import.meta.glob<PricingModule>('./pricing.ts', { eager: true });
const pricing: PricingModule | undefined = mods['./pricing.ts'];

export function estimateCost(variant: Variant, input: Record<string, unknown>): CostEstimate | null {
  try {
    return pricing?.estimateCost?.(variant, input) ?? null;
  } catch {
    return null;
  }
}

export function formatUSD(usd: number): string {
  if (pricing?.formatUSD) return pricing.formatUSD(usd);
  if (!Number.isFinite(usd)) return '—';
  const s = usd >= 1 ? usd.toFixed(2) : usd.toFixed(usd >= 0.1 ? 3 : 4).replace(/0+$/, '');
  return `$${s.endsWith('.') ? s + '00' : s}`;
}

const UNIT_SUFFIX: [RegExp, string][] = [
  [/second/i, '/s'],
  [/megapixel/i, '/MP'],
  [/image/i, '/image'],
  [/video/i, '/video'],
  [/generation|run/i, '/run'],
  [/token/i, '/1M tok'],
];

export function unitSuffix(unit: string): string {
  for (const [re, s] of UNIT_SUFFIX) if (re.test(unit)) return s;
  return '';
}

function cheapestTier(variant: Variant): PriceTier | null {
  if (pricing?.startingPrice) {
    try {
      return pricing.startingPrice(variant);
    } catch {
      return null;
    }
  }
  const tiers = variant.pricing.filter((t) => !/token/i.test(t.unit));
  if (!tiers.length) return null;
  return tiers.reduce((a, b) => (b.priceUSD < a.priceUSD ? b : a));
}

/** "from $0.09/s" across all variants, or "Billed by usage" when there is no flat tier. */
export function startingPriceLabel(model: CatalogModel): string | null {
  let best: PriceTier | null = null;
  for (const v of model.variants) {
    const t = cheapestTier(v);
    if (t && (!best || t.priceUSD < best.priceUSD)) best = t;
  }
  if (best) return `from ${formatUSD(best.priceUSD)}${unitSuffix(best.unit)}`;
  return model.variants.some((v) => v.pricing.length) ? 'Billed by usage' : null;
}

export function isUsageBilled(variant: Variant): boolean {
  return variant.pricing.length > 0 && cheapestTier(variant) === null;
}
