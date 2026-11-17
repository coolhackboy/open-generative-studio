/**
 * Client-side cost estimator for PoYo generations, driven by the pricing tiers in catalog.json.
 * Pure functions, type-only imports (also runnable directly by Node's type stripping for tests).
 *
 * Estimates are indicative; the PoYo API bills the final amount. 1 credit = $0.005.
 */
import type { FieldSchema, PriceTier, Variant } from '../types/catalog';

export const USD_PER_CREDIT = 0.005;

export interface CostEstimate {
  usd: number;
  credits: number;
  /** Human readable breakdown, e.g. "720p / No video input: $0.205/s × 5 s". */
  label: string;
}

export interface EstimateContext {
  /** Total duration (s) of reference/source videos, when known. Used for "billed second" tiers. */
  referenceVideoSeconds?: number;
}

type UnitKind = 'second' | 'billed_second' | 'image' | 'generation' | 'input_image' | 'megapixel' | 'flat' | 'token' | 'unknown';

function unitKind(t: PriceTier): UnitKind {
  const d = typeof t.dims?.unit === 'string' ? t.dims.unit.toLowerCase() : '';
  switch (d) {
    case 'second':
      return 'second';
    case 'billed_second':
      return 'billed_second';
    case 'image':
      return 'image';
    case 'generation':
      return 'generation';
    case 'input_image':
      return 'input_image';
    case 'megapixel':
      return 'megapixel';
    case 'mtok':
    case 'token':
      return 'token';
    case 'video':
    case 'run':
    case 'request':
      return 'flat';
  }
  const u = (t.unit || '').toLowerCase();
  if (/token/.test(u)) return 'token';
  if (/billed second|reference video second/.test(u)) return 'billed_second';
  if (/second/.test(u)) return 'second';
  if (/input image/.test(u)) return 'input_image';
  if (/megapixel/.test(u)) return 'megapixel';
  if (/generation/.test(u)) return 'generation';
  if (/image/.test(u)) return 'image';
  if (/video|run|request|task|call/.test(u)) return 'flat';
  return 'unknown';
}

const round = (x: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
};

function lower(v: unknown): string | undefined {
  return typeof v === 'string' || typeof v === 'number' ? String(v).trim().toLowerCase() : undefined;
}

function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function mediaCount(value: unknown): number {
  if (Array.isArray(value)) return value.filter((x) => typeof x === 'string' ? x.trim() !== '' : x != null).length;
  if (typeof value === 'string') return value.trim() ? 1 : 0;
  return 0;
}

function countMedia(props: Record<string, FieldSchema>, input: Record<string, unknown>, kind: 'image' | 'video' | 'audio') {
  let n = 0;
  for (const [name, f] of Object.entries(props)) if (f.media === kind) n += mediaCount(input[name]);
  return n;
}

/** Keep the filtered list only if it is non-empty (soft filter). */
function soft<T>(list: T[], keep: (t: T) => boolean): T[] {
  const next = list.filter(keep);
  return next.length ? next : list;
}

const resolutionsOf = (t: PriceTier): string[] | undefined => {
  const r = t.dims?.resolution;
  return typeof r === 'string' ? r.toLowerCase().split('/').map((s) => s.trim()) : undefined;
};

const asStrings = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined;

export function formatUSD(usd: number): string {
  if (!Number.isFinite(usd)) return '—';
  if (usd === 0) return '$0';
  const digits = usd >= 1 ? 2 : usd >= 0.1 ? 3 : 4;
  let s = usd.toFixed(digits);
  // trim trailing zeros, keeping at least 2 decimals
  while (s.includes('.') && s.split('.')[1].length > 2 && s.endsWith('0')) s = s.slice(0, -1);
  return `$${s}`;
}

/**
 * Estimate the cost of one submit. Returns null when the variant is billed by usage
 * (token-based) or the inputs needed for the estimate are missing.
 */
export function estimateCost(
  variant: Variant,
  input: Record<string, unknown>,
  ctx: EstimateContext = {},
): CostEstimate | null {
  const tiers = variant.pricing || [];
  if (!tiers.length) return null;
  const props = variant.schema?.properties || {};

  // Effective input = schema defaults overlaid by user values.
  const values: Record<string, unknown> = {};
  for (const [k, f] of Object.entries(props)) if (f.default !== undefined) values[k] = f.default;
  for (const [k, v] of Object.entries(input || {})) if (v !== undefined && v !== null && v !== '') values[k] = v;

  const images = countMedia(props, values, 'image');
  const videos = countMedia(props, values, 'video');
  const hasImage = images > 0;
  const hasVideo = videos > 0;

  const resolution =
    lower(values.resolution) ?? (typeof values.size === 'string' && /^\d+(\.\d+)?k$/i.test(values.size) ? lower(values.size) : undefined);
  // 0 / missing = "same as the source media" for several models -> unknown
  const durRaw = toNumber(values.duration) ?? toNumber(values.seconds);
  const duration = durRaw !== undefined && durRaw > 0 ? durRaw : undefined;
  const quality = lower(values.quality);
  const audioRaw = [values.generate_audio, values.sound, values.audio, values.enable_audio].find((v) => typeof v === 'boolean');
  const audio = typeof audioRaw === 'boolean' ? audioRaw : undefined;
  const count = Math.max(1, Math.floor(toNumber(values.n) ?? toNumber(values.num_images) ?? toNumber(values.num_outputs) ?? 1));

  let base = tiers.filter((t) => !t.dims?.addon);
  const addons = tiers.filter((t) => t.dims?.addon);
  if (!base.length) return null;
  const priced = base.filter((t) => unitKind(t) !== 'token' && unitKind(t) !== 'unknown');
  if (!priced.length) return null; // billed by usage
  base = priced;

  // Pick the tier matching the request.
  base = soft(base, (t) => typeof t.dims?.videoInput !== 'boolean' || t.dims.videoInput === hasVideo);
  if (resolution) {
    base = soft(base, (t) => {
      const r = resolutionsOf(t);
      return !r || r.includes(resolution);
    });
  }
  if (audio !== undefined) base = soft(base, (t) => typeof t.dims?.audio !== 'boolean' || t.dims.audio === audio);
  if (quality) base = soft(base, (t) => typeof t.dims?.quality !== 'string' || t.dims.quality.toLowerCase() === quality);
  if (duration !== undefined) {
    base = soft(base, (t) => {
      const d = t.dims?.durations;
      return !Array.isArray(d) || d.includes(duration);
    });
    base = soft(base, (t) => typeof t.dims?.durationOnly !== 'number' || t.dims.durationOnly === duration);
  }
  const plausibleTasks = hasVideo
    ? ['v2v_edit', 'extend', 'r2v', 'animate_move', 'animate_replace', 'video_gen', 'edit']
    : hasImage
      ? ['i2i', 'edit', 'image_gen_edit', 'i2v', 'r2v', 'keyframes', 'first_last', 'i2svg', 'image_gen', 'video_gen', 'animate_move', 'animate_replace']
      : ['t2i', 'image_gen_edit', 't2v', 't2svg', 'image_gen', 'video_gen'];
  base = soft(base, (t) => {
    const tasks = asStrings(t.dims?.tasks);
    return !tasks || tasks.some((x) => plausibleTasks.includes(x));
  });
  base = hasImage
    ? soft(base, (t) => t.dims?.label === 'with_reference_images')
    : soft(base, (t) => t.dims?.label !== 'with_reference_images');

  let tier = base[0];
  // Several tiers still match (e.g. resolution not exposed as an input): show the cheapest as "from".
  const ambiguous = base.some((t) => t.priceUSD !== tier.priceUSD);
  if (ambiguous) tier = base.reduce((x, y) => (y.priceUSD < x.priceUSD ? y : x));
  const kind = unitKind(tier);
  let qty: number;
  let what: string;
  switch (kind) {
    case 'second':
      if (duration === undefined) return null;
      qty = duration;
      what = `${formatUSD(tier.priceUSD)}/s × ${duration} s`;
      break;
    case 'billed_second': {
      if (duration === undefined) return null;
      const ref = hasVideo ? ctx.referenceVideoSeconds : 0;
      const rules = asStrings(tier.dims?.rules) || [];
      if (!hasVideo) {
        qty = duration; // no reference/source video: billed seconds = output seconds
      } else if (rules.includes('kling_billed_seconds')) {
        qty = duration + Math.max(Math.ceil(ref ?? duration), duration);
      } else {
        qty = duration + Math.ceil(ref ?? duration);
      }
      what = `${formatUSD(tier.priceUSD)}/billed s × ${qty} s${ref === undefined ? ' (est., output + reference video)' : ''}`;
      break;
    }
    case 'image':
      qty = count;
      what = `${formatUSD(tier.priceUSD)}/image × ${count}`;
      break;
    case 'generation':
      qty = count;
      what = `${formatUSD(tier.priceUSD)} per generation${count > 1 ? ` × ${count}` : ''}`;
      break;
    case 'input_image':
      qty = Math.max(1, images);
      what = `${formatUSD(tier.priceUSD)}/input image × ${qty}`;
      break;
    case 'megapixel': {
      const m = typeof values.size === 'string' ? values.size.match(/^(\d+)\s*[x*×]\s*(\d+)$/i) : null;
      const w = m ? Number(m[1]) : toNumber(values.width);
      const h = m ? Number(m[2]) : toNumber(values.height);
      const mp = w && h ? Math.max(1, Math.ceil((w * h) / 1_000_000)) : 1;
      qty = mp * count;
      what = `${formatUSD(tier.priceUSD)}/MP × ${qty}${w && h ? '' : ' (est. 1 MP)'}`;
      break;
    }
    case 'flat':
      qty = 1;
      what = `${formatUSD(tier.priceUSD)} ${tier.unit || 'per run'}`;
      break;
    default:
      return null;
  }

  let credits = tier.credits * qty;
  let usd = tier.priceUSD * qty;
  const parts = [`${ambiguous ? 'from ' : ''}${tier.spec ? `${tier.spec}: ` : ''}${what}`];

  const tierRules = asStrings(tier.dims?.rules) || [];
  if (!tierRules.includes('reference_images_free')) {
    for (const a of addons) {
      const addon = a.dims?.addon;
      if (addon !== 'reference_image' && addon !== 'input_image') continue;
      const free = toNumber(a.dims?.freeCount) ?? 0;
      const n = Math.max(0, images - free);
      if (!n) continue;
      credits += a.credits * n;
      usd += a.priceUSD * n;
      parts.push(`${n} ${addon === 'input_image' ? 'input' : 'reference'} image${n > 1 ? 's' : ''} × ${formatUSD(a.priceUSD)}`);
    }
  }

  return { usd: round(usd, 6), credits: round(credits, 2), label: parts.join(' + ') };
}

/** Cheapest non-token base tier, for "from $x per image" badges. Null when billed by usage. */
export function startingPrice(variant: Variant): PriceTier | null {
  const base = (variant.pricing || []).filter((t) => !t.dims?.addon && !['token', 'unknown'].includes(unitKind(t)));
  if (!base.length) return null;
  return base.reduce((a, b) => (b.priceUSD < a.priceUSD ? b : a));
}
