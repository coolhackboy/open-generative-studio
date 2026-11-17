import { create } from 'zustand';
import { config } from '../config';
import { defaultModel, getModel, getVariant, models } from '../data/catalog';
import type { CatalogModel, Variant } from '../types/catalog';
import { setAuthSource } from './api';
import { db, local } from './db';
import { uid } from './format';
import { getMediaFields, initialParams, isMediaField, type MediaKind, type Params } from './schema';
import type { Generation } from './types';

// ---------------------------------------------------------------- settings

const KEY_API = 'ogs.apiKey';
const KEY_BASE = 'ogs.apiBase';

interface SettingsState {
  apiKey: string;
  apiBase: string;
  setApiKey: (key: string) => void;
  setApiBase: (base: string) => void;
}

export const useSettings = create<SettingsState>((setState) => ({
  apiKey: local.get(KEY_API) ?? '',
  apiBase: local.get(KEY_BASE) || config.defaultApiBase,
  setApiKey: (key) => {
    const v = key.trim();
    if (v) local.set(KEY_API, v);
    else local.remove(KEY_API);
    setState({ apiKey: v });
  },
  setApiBase: (base) => {
    const v = base.trim().replace(/\/+$/, '') || config.defaultApiBase;
    if (v === config.defaultApiBase) local.remove(KEY_BASE);
    else local.set(KEY_BASE, v);
    setState({ apiBase: v });
  },
}));

setAuthSource(() => {
  const s = useSettings.getState();
  return { apiKey: s.apiKey, baseUrl: s.apiBase };
});

// ---------------------------------------------------------------- gallery

export type GalleryFilter = 'all' | 'image' | 'video';

interface GalleryState {
  items: Generation[];
  loaded: boolean;
  filter: GalleryFilter;
  setFilter: (f: GalleryFilter) => void;
  load: () => Promise<Generation[]>;
  upsert: (gen: Generation) => void;
  patch: (id: string, patch: Partial<Generation>) => void;
  remove: (id: string) => void;
  clearAll: () => Promise<void>;
}

const sortNewest = (a: Generation, b: Generation) => b.createdAt - a.createdAt;

export const useGallery = create<GalleryState>((setState, getState) => ({
  items: [],
  loaded: false,
  filter: 'all',
  setFilter: (filter) => setState({ filter }),
  load: async () => {
    const items = (await db.all()).sort(sortNewest);
    setState({ items, loaded: true });
    return items;
  },
  upsert: (gen) => {
    const items = [gen, ...getState().items.filter((g) => g.id !== gen.id)].sort(sortNewest);
    setState({ items });
    void db.put(gen);
  },
  patch: (id, p) => {
    let updated: Generation | undefined;
    const items = getState().items.map((g) => {
      if (g.id !== id) return g;
      updated = { ...g, ...p, updatedAt: Date.now() };
      return updated;
    });
    if (!updated) return;
    setState({ items });
    void db.put(updated);
  },
  remove: (id) => {
    setState({ items: getState().items.filter((g) => g.id !== id) });
    void db.remove(id);
  },
  clearAll: async () => {
    setState({ items: [] });
    await db.clear();
  },
}));

// ---------------------------------------------------------------- composer

export interface MediaItem {
  id: string;
  field: string;
  kind: MediaKind;
  name: string;
  /** Local object URL or remote URL used for the thumbnail. */
  previewUrl: string;
  /** Hosted URL once uploaded. */
  url?: string;
  status: 'uploading' | 'ready' | 'error';
  progress: number;
  error?: string;
  file?: File;
}

const KEY_LAST_MODEL = 'ogs.lastModel';
const paramsKey = (variant: string) => `ogs.params.${variant}`;

interface ComposerState {
  modelId: string;
  variant: string;
  prompt: string;
  params: Params;
  media: MediaItem[];
  submitting: boolean;
  setModel: (modelId: string, variant?: string) => void;
  setVariant: (variant: string) => void;
  setPrompt: (prompt: string) => void;
  setParam: (name: string, value: unknown) => void;
  addMedia: (item: MediaItem) => void;
  updateMedia: (id: string, patch: Partial<MediaItem>) => void;
  removeMedia: (id: string) => void;
  setSubmitting: (v: boolean) => void;
  /** Load a full preset (example or "Reuse settings"). */
  applyPreset: (p: { modelId: string; variant?: string; input: Record<string, unknown> }) => void;
}

function resolveInitialModel(): { modelId: string; variant: string } {
  const saved = local.getJSON<{ modelId: string; variant: string }>(KEY_LAST_MODEL);
  const m = (saved && getModel(saved.modelId)) || defaultModel || models[0];
  if (!m) return { modelId: '', variant: '' };
  return { modelId: m.id, variant: getVariant(m, saved?.variant).model };
}

function savedParams(variant: string): Params | undefined {
  return local.getJSON<Params>(paramsKey(variant));
}


/** Keep media whose field still exists in the new variant. */
function carryMedia(media: MediaItem[], model: CatalogModel, variant: Variant): MediaItem[] {
  const fields = new Map(getMediaFields(variant, model.category).map((f) => [f.name, f]));
  const counts = new Map<string, number>();
  return media.filter((m) => {
    const f = fields.get(m.field);
    if (!f) return false;
    const c = (counts.get(m.field) ?? 0) + 1;
    counts.set(m.field, c);
    return c <= f.max;
  });
}

export const useComposer = create<ComposerState>((setState, getState) => ({
  modelId: '',
  variant: '',
  prompt: '',
  params: {},
  media: [],
  submitting: false,

  setModel: (modelId, variantId) => {
    const model = getModel(modelId);
    if (!model) return;
    const variant = getVariant(model, variantId ?? local.getJSON<{ v: string }>(`ogs.variant.${modelId}`)?.v);
    local.setJSON(KEY_LAST_MODEL, { modelId, variant: variant.model });
    setState({
      modelId,
      variant: variant.model,
      params: initialParams(variant, savedParams(variant.model)),
      media: carryMedia(getState().media, model, variant),
    });
  },

  setVariant: (variantId) => {
    const model = getModel(getState().modelId);
    if (!model) return;
    const variant = getVariant(model, variantId);
    local.setJSON(KEY_LAST_MODEL, { modelId: model.id, variant: variant.model });
    local.setJSON(`ogs.variant.${model.id}`, { v: variant.model });
    // Keep values the user already chose when the new variant accepts them.
    const merged = initialParams(variant, { ...savedParams(variant.model), ...getState().params });
    setState({
      variant: variant.model,
      params: merged,
      media: carryMedia(getState().media, model, variant),
    });
  },

  setPrompt: (prompt) => setState({ prompt }),

  setParam: (name, value) => {
    const params = { ...getState().params };
    if (value === undefined) delete params[name];
    else params[name] = value;
    local.setJSON(paramsKey(getState().variant), params);
    setState({ params });
  },

  addMedia: (item) => setState({ media: [...getState().media, item] }),
  updateMedia: (id, p) =>
    setState({ media: getState().media.map((m) => (m.id === id ? { ...m, ...p } : m)) }),
  removeMedia: (id) => {
    const item = getState().media.find((m) => m.id === id);
    if (item?.previewUrl.startsWith('blob:') && item.previewUrl !== item.url) URL.revokeObjectURL(item.previewUrl);
    setState({ media: getState().media.filter((m) => m.id !== id) });
  },
  setSubmitting: (submitting) => setState({ submitting }),

  applyPreset: ({ modelId, variant: variantId, input }) => {
    const model = getModel(modelId);
    if (!model) return;
    const variant = getVariant(model, variantId);
    const props = variant.schema.properties;
    const media: MediaItem[] = [];
    const params: Params = {};
    for (const [k, v] of Object.entries(input)) {
      const f = props[k];
      if (!f || k === 'prompt') continue;
      if (isMediaField(k, f)) {
        const urls = (Array.isArray(v) ? v : [v]).filter(
          (u): u is string => typeof u === 'string' && /^https?:/.test(u) && !/example\.com/.test(u),
        );
        const fieldInfo = getMediaFields(variant, model.category).find((m) => m.name === k);
        for (const url of urls)
          media.push({
            id: uid(),
            field: k,
            kind: fieldInfo?.kind ?? 'image',
            name: url.split('/').pop() ?? 'media',
            previewUrl: url,
            url,
            status: 'ready',
            progress: 100,
          });
      } else params[k] = v;
    }
    local.setJSON(KEY_LAST_MODEL, { modelId: model.id, variant: variant.model });
    setState({
      modelId: model.id,
      variant: variant.model,
      prompt: typeof input.prompt === 'string' ? input.prompt : '',
      params: initialParams(variant, params),
      media,
    });
  },
}));

/** Call once after `loadCatalog()` resolves: restores the last-used model and its params. */
export function initComposer(): void {
  const initial = resolveInitialModel();
  const m = getModel(initial.modelId);
  if (!m) return;
  const v = getVariant(m, initial.variant);
  useComposer.setState({ modelId: m.id, variant: v.model, params: initialParams(v, savedParams(v.model)) });
}

export function useCurrentModel(): { model: CatalogModel | undefined; variant: Variant | undefined } {
  const modelId = useComposer((s) => s.modelId);
  const variantId = useComposer((s) => s.variant);
  const model = getModel(modelId);
  return { model, variant: model ? getVariant(model, variantId) : undefined };
}

// ---------------------------------------------------------------- UI

interface UIState {
  paletteOpen: boolean;
  settingsOpen: boolean;
  lightboxId: string | null;
  setPaletteOpen: (v: boolean) => void;
  setSettingsOpen: (v: boolean) => void;
  openLightbox: (id: string | null) => void;
}

export const useUI = create<UIState>((setState) => ({
  paletteOpen: false,
  settingsOpen: false,
  lightboxId: null,
  setPaletteOpen: (paletteOpen) => setState({ paletteOpen }),
  setSettingsOpen: (settingsOpen) => setState({ settingsOpen }),
  openLightbox: (lightboxId) => setState({ lightboxId }),
}));

export function focusPrompt(): void {
  const el = document.getElementById('prompt-input');
  if (el instanceof HTMLTextAreaElement) {
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }
}
