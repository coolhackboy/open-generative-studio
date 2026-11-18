import type { CatalogModel } from '../types/catalog';

/**
 * Forgiving model search: substring, space-insensitive ("nanobanana") and subsequence
 * ("klng") matching, plus task shorthands and maker aliases. Every query term must match.
 */

/** Shorthand → alternatives (a term matches if any alternative does). */
const TASK_ALIASES: Record<string, string[]> = {
  t2v: ['text to video'],
  i2v: ['image to video'],
  v2v: ['video to video'],
  r2v: ['reference to video'],
  t2i: ['text to image'],
  i2i: ['image to image'],
  edit: ['edit', 'image to image'],
  avatar: ['avatar', 'lip sync', 'talking'],
  lipsync: ['lip sync', 'talking avatar'],
};

/** Extra words a model should be findable by (maker / family names). */
const MAKER_ALIASES: [RegExp, string][] = [
  [/seedance|seedream|omnihuman|bytedance/i, 'bytedance doubao'],
  [/kling/i, 'kuaishou kling'],
  [/veo|gemini|nano banana|imagen|google/i, 'google deepmind'],
  [/sora|gpt|openai/i, 'openai'],
  [/flux|black forest/i, 'bfl black forest labs flux'],
  [/wan|qwen|alibaba/i, 'alibaba tongyi'],
  [/grok|xai/i, 'xai grok'],
  [/hailuo|minimax/i, 'minimax hailuo'],
  [/mai image|microsoft/i, 'microsoft'],
  [/vidu/i, 'shengshu vidu'],
  [/runway/i, 'runway'],
  [/ideogram/i, 'ideogram'],
];

const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export interface SearchHit {
  model: CatalogModel;
  score: number;
  /** Indices of matched characters in `model.name` (for highlighting). */
  nameMatches: number[];
}

interface Indexed {
  model: CatalogModel;
  name: string;
  text: string;
  compactText: string;
}

export function buildIndex(models: CatalogModel[]): Indexed[] {
  return models.map((m) => {
    const base = [m.name, m.provider, m.id, m.category, ...m.tasks, ...m.variants.flatMap((v) => [v.label, v.model])].join(' ');
    const makers = MAKER_ALIASES.filter(([re]) => re.test(`${m.name} ${m.provider} ${m.id}`)).map(([, a]) => a);
    const text = `${base} ${makers.join(' ')}`.toLowerCase();
    return { model: m, name: m.name, text, compactText: compact(text) };
  });
}

const isWordChar = (s: string, i: number) =>
  /[a-z0-9]/.test(s[i] ?? '') || (s[i] === '.' && /[0-9]/.test(s[i - 1] ?? '') && /[0-9]/.test(s[i + 1] ?? ''));

/** True when `lower[start..end]` is a whole word, so "2" does not count as a hit inside "2.1" or "25". */
function isWholeWord(lower: string, start: number, end: number): boolean {
  return !isWordChar(lower, start - 1) && !isWordChar(lower, end + 1);
}

/** Character indices in `name` matched by `term` (substring first, then subsequence). */
function matchName(name: string, term: string): number[] | null {
  const lower = name.toLowerCase();
  const at = lower.indexOf(term);
  if (at !== -1) return Array.from({ length: term.length }, (_, i) => at + i);
  // Space-insensitive substring: map compact positions back to original indices.
  const idx: number[] = [];
  const chars: string[] = [];
  for (let i = 0; i < lower.length; i++)
    if (/[a-z0-9]/.test(lower[i])) {
      idx.push(i);
      chars.push(lower[i]);
    }
  const c = chars.join('');
  const ct = compact(term);
  if (!ct) return null;
  const cAt = c.indexOf(ct);
  if (cAt !== -1) return idx.slice(cAt, cAt + ct.length);
  // Subsequence ("klng" → Kling): must start at a word and stay tight to avoid noise.
  if (ct.length < 3) return null;
  const out: number[] = [];
  let j = 0;
  for (let i = 0; i < c.length && j < ct.length; i++) {
    if (c[i] !== ct[j]) continue;
    out.push(idx[i]);
    j++;
  }
  if (j !== ct.length) return null;
  const startsWord = out[0] === 0 || !/[a-z0-9]/.test(lower[out[0] - 1]);
  const span = out[out.length - 1] - out[0] + 1;
  const maxSpan = ct.length < 5 ? ct.length + 1 : Math.ceil(ct.length * 1.5) + 1;
  return startsWord && span <= maxSpan ? out : null;
}

export function searchModels(index: Indexed[], query: string): SearchHit[] {
  const raw = query.trim().toLowerCase();
  if (!raw) return index.map((x) => ({ model: x.model, score: 0, nameMatches: [] }));
  const terms = raw.split(/\s+/).map((t) => TASK_ALIASES[t] ?? [t]);
  const hits: SearchHit[] = [];
  const compactQuery = compact(raw);
  for (const x of index) {
    const lower = x.name.toLowerCase();
    // The query spells the whole name ("nano banana 2" → Nano Banana 2, not 2.1 or 2 Lite).
    let score = compact(x.name) === compactQuery ? 200 : 0;
    const nameMatches = new Set<number>();
    let ok = true;
    for (const alternatives of terms) {
      let best = 0;
      let bestMatches: number[] = [];
      for (const term of alternatives) {
        const nm = matchName(x.name, term);
        if (nm) {
          const contiguous = nm.length > 0 && nm[nm.length - 1] - nm[0] === nm.length - 1;
          let sc = contiguous ? (nm[0] === 0 ? 120 : 100) : 60;
          if (contiguous && isWholeWord(lower, nm[0], nm[nm.length - 1])) sc += 15;
          if (sc > best) [best, bestMatches] = [sc, nm];
        } else if (x.text.includes(term)) best = Math.max(best, 40);
        else if (x.compactText.includes(compact(term))) best = Math.max(best, 30);
      }
      if (!best) {
        ok = false;
        break;
      }
      score += best;
      bestMatches.forEach((i) => nameMatches.add(i));
    }
    if (ok) hits.push({ model: x.model, score, nameMatches: [...nameMatches].sort((a, b) => a - b) });
  }
  return hits.sort((a, b) => b.score - a.score || a.model.order - b.model.order);
}
