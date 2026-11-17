import { create } from 'zustand';
import { config } from '../config';

/**
 * Showcase wall data: real outputs, never fabricated. `input` and `credits` are present only
 * when the exact request behind that output is known; otherwise the UI shows "Sample output".
 * White-label: point VITE_SHOWCASE_URL at your own JSON with the same shape.
 */
export interface ShowcaseItem {
  id: string;
  /** Catalog model id. */
  model: string;
  /** API model id, when known. */
  variant?: string;
  type: 'image' | 'video';
  src: string;
  poster?: string;
  /** width / height */
  aspect: number;
  alt: string;
  input?: Record<string, unknown>;
  credits?: number;
  source?: string;
}

interface ShowcaseState {
  items: ShowcaseItem[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  load: () => Promise<void>;
}

function resolve(url: string | undefined, base: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
}

export const useShowcase = create<ShowcaseState>((set, get) => ({
  items: [],
  status: 'idle',
  load: async () => {
    if (get().status === 'loading' || get().status === 'ready') return;
    set({ status: 'loading' });
    try {
      const jsonUrl = new URL(config.showcaseUrl, window.location.href).href;
      const res = await fetch(jsonUrl);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { items?: ShowcaseItem[] };
      const items = (data.items ?? [])
        .filter((x) => x && x.src && (x.type === 'image' || x.type === 'video'))
        .map((x) => ({
          ...x,
          src: resolve(x.src, jsonUrl)!,
          poster: resolve(x.poster, jsonUrl),
          aspect: x.aspect > 0 ? x.aspect : x.type === 'video' ? 16 / 9 : 1,
        }));
      set({ items, status: 'ready' });
    } catch {
      set({ status: 'error' });
    }
  },
}));

export function hasKnownInput(item: ShowcaseItem): item is ShowcaseItem & { input: Record<string, unknown> } {
  return !!item.input && typeof item.input.prompt === 'string';
}
