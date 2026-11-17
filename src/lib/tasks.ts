import { findVariant, getModel, getVariant } from '../data/catalog';
import { toast } from '../ui/toast';
import { api, ApiError, MOCK_MODE } from './api';
import { estimateCost } from './cost';
import { uid } from './format';
import { buildInput, estimateAspect, getMediaFields, validateInput, type MediaKind } from './schema';
import { useComposer, useGallery, useSettings, useUI, type MediaItem } from './store';
import { isTerminal, type Generation } from './types';

// ---------------------------------------------------------------- polling

const FAST_MS = 3000;
const SLOW_MS = 8000;
const SLOW_AFTER_MS = 60_000;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const failures = new Map<string, number>();

function schedule(id: string, ms: number): void {
  clearTimeout(timers.get(id));
  timers.set(id, setTimeout(() => void tick(id), ms));
}

function nextDelay(gen: Generation): number {
  const errs = failures.get(gen.id) ?? 0;
  if (errs > 0) return Math.min(30_000, SLOW_MS * 2 ** (errs - 1));
  return Date.now() - gen.createdAt > SLOW_AFTER_MS ? SLOW_MS : FAST_MS;
}

async function tick(id: string): Promise<void> {
  timers.delete(id);
  const gen = useGallery.getState().items.find((g) => g.id === id);
  if (!gen || !gen.taskId || isTerminal(gen.status)) return;
  try {
    const s = await api.status(gen.taskId);
    failures.delete(id);
    const patch: Partial<Generation> = {
      status: s.status,
      progress: s.status === 'finished' ? 100 : Math.max(gen.progress, s.progress),
    };
    if (s.credits != null) patch.credits = s.credits;
    if (s.status === 'finished') {
      patch.files = s.files;
      patch.finishedAt = Date.now();
      if (s.files.length === 0) {
        patch.status = 'failed';
        patch.error = 'The task finished without returning any files.';
      }
    }
    if (s.status === 'failed') {
      patch.error = s.error || 'Generation failed.';
      patch.finishedAt = Date.now();
    }
    useGallery.getState().patch(id, patch);
    if (!isTerminal(patch.status ?? gen.status)) schedule(id, nextDelay(gen));
  } catch (e) {
    // Auth / not-found errors are final; network or 5xx errors keep retrying with backoff.
    if (e instanceof ApiError && (e.code === 401 || e.code === 403 || e.code === 404)) {
      useGallery.getState().patch(id, { status: 'failed', error: e.message });
      return;
    }
    failures.set(id, (failures.get(id) ?? 0) + 1);
    schedule(id, nextDelay(gen));
  }
}

export function track(id: string): void {
  failures.delete(id);
  schedule(id, FAST_MS);
}

/** On startup: resume polling for unfinished tasks; fail ones interrupted before submit. */
export function resumeAll(items: Generation[]): void {
  for (const g of items) {
    if (isTerminal(g.status)) continue;
    if (g.taskId) schedule(g.id, 300);
    else
      useGallery
        .getState()
        .patch(g.id, { status: 'failed', error: 'Interrupted before the task was submitted. Retry to send it again.' });
  }
}

// ---------------------------------------------------------------- submit

function needsKey(): boolean {
  if (MOCK_MODE) return false;
  if (useSettings.getState().apiKey) return false;
  toast.show({ title: 'Add your API key to generate', description: 'Generations run on your own PoYo account.', tone: 'info' });
  useUI.getState().setSettingsOpen(true);
  return true;
}

async function submitGeneration(gen: Generation): Promise<boolean> {
  const { upsert, patch } = useGallery.getState();
  upsert(gen);
  try {
    const r = await api.submit(gen.variant, gen.input);
    patch(gen.id, { taskId: r.taskId, status: r.status });
    track(gen.id);
    return true;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Request failed';
    patch(gen.id, { status: 'failed', error: message });
    toast.show({ title: 'Generation not started', description: message, tone: 'danger' });
    if (e instanceof ApiError && e.code === 401) useUI.getState().setSettingsOpen(true);
    return false;
  }
}

/** Generate from the composer's current state. */
export async function generate(): Promise<void> {
  const c = useComposer.getState();
  if (c.submitting) return;
  const model = getModel(c.modelId);
  if (!model) return;
  const variant = getVariant(model, c.variant);

  if (c.media.some((m) => m.status === 'uploading')) {
    toast.show({ title: 'Still uploading', description: 'Wait for references to finish uploading.', tone: 'info' });
    return;
  }
  if (c.media.some((m) => m.status === 'error')) {
    toast.show({ title: 'Remove failed uploads first', tone: 'danger' });
    return;
  }

  const mediaUrls: Record<string, string[]> = {};
  for (const m of c.media) if (m.url) (mediaUrls[m.field] ??= []).push(m.url);
  const input = buildInput({ variant, prompt: c.prompt, params: c.params, media: mediaUrls });

  const problems = validateInput(variant, model.category, input);
  if (problems.length) {
    toast.show({ title: problems[0], description: problems.slice(1).join(' '), tone: 'danger' });
    return;
  }
  if (needsKey()) return;

  const now = Date.now();
  const gen: Generation = {
    id: uid(),
    modelId: model.id,
    variant: variant.model,
    modelName: model.name,
    variantLabel: model.variants.length > 1 ? variant.label : undefined,
    category: model.category,
    prompt: typeof input.prompt === 'string' ? input.prompt : '',
    input,
    status: 'submitting',
    progress: 0,
    files: [],
    estimateUSD: estimateCost(variant, input)?.usd,
    aspect: estimateAspect(model.category, input),
    createdAt: now,
    updatedAt: now,
    apiBase: useSettings.getState().apiBase,
    mock: MOCK_MODE || undefined,
  };

  c.setSubmitting(true);
  try {
    await submitGeneration(gen);
  } finally {
    useComposer.getState().setSubmitting(false);
  }
}

/** Re-submit a failed generation with the exact same input. */
export async function retry(id: string): Promise<void> {
  const old = useGallery.getState().items.find((g) => g.id === id);
  if (!old || needsKey()) return;
  const now = Date.now();
  await submitGeneration({
    ...old,
    taskId: undefined,
    status: 'submitting',
    progress: 0,
    files: [],
    error: undefined,
    credits: undefined,
    finishedAt: undefined,
    createdAt: now,
    updatedAt: now,
    apiBase: useSettings.getState().apiBase,
  });
}

export function reuse(gen: Generation): void {
  const found = findVariant(gen.variant);
  useComposer
    .getState()
    .applyPreset({ modelId: found?.model.id ?? gen.modelId, variant: gen.variant, input: gen.input });
}

/** Dev mock mode only: fill the gallery with demo generations in every state. */
export async function seedDemo(): Promise<void> {
  if (!import.meta.env.DEV || !MOCK_MODE) return;
  const { demoGenerations } = await import('./mock');
  const gens = demoGenerations(useSettings.getState().apiBase);
  for (const g of gens) useGallery.getState().upsert(g);
  resumeAll(gens);
}

// ---------------------------------------------------------------- uploads

const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export function kindOfFile(file: File): MediaKind | null {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return null;
}

/** Upload files into the composer, routing each to the first matching media field with room. */
export function addFiles(files: File[] | FileList, targetField?: string): void {
  const c = useComposer.getState();
  const model = getModel(c.modelId);
  if (!model) return;
  const variant = getVariant(model, c.variant);
  const fields = getMediaFields(variant, model.category);
  if (fields.length === 0) {
    toast.show({ title: `${model.name} doesn't take reference media`, tone: 'info' });
    return;
  }

  for (const file of Array.from(files)) {
    const kind = kindOfFile(file);
    if (!kind) {
      toast.show({ title: `Unsupported file: ${file.name}`, tone: 'danger' });
      continue;
    }
    if (kind === 'video' && file.size > MAX_VIDEO_BYTES) {
      toast.show({ title: 'Video too large', description: 'Videos must be 100 MB or smaller.', tone: 'danger' });
      continue;
    }
    const media = useComposer.getState().media;
    const used = (name: string) => media.filter((m) => m.field === name).length;
    const field = targetField
      ? fields.find((f) => f.name === targetField && used(f.name) < f.max)
      : fields.find((f) => (f.kind === kind || f.kind === 'file') && used(f.name) < f.max);
    if (!field) {
      const accepts = fields.some((f) => f.kind === kind || f.kind === 'file');
      toast.show({
        title: accepts ? 'Reference limit reached' : `${model.name} doesn't accept ${kind} input`,
        tone: 'info',
      });
      continue;
    }
    if (field.kind !== 'file' && field.kind !== kind) {
      toast.show({ title: `“${field.label}” expects ${field.kind} files`, tone: 'danger' });
      continue;
    }
    void uploadItem({
      id: uid(),
      field: field.name,
      kind,
      name: file.name,
      previewUrl: URL.createObjectURL(file),
      status: 'uploading',
      progress: 0,
      file,
    });
  }
}

async function uploadItem(item: MediaItem): Promise<void> {
  const { addMedia, updateMedia } = useComposer.getState();
  addMedia(item);
  if (!MOCK_MODE && !useSettings.getState().apiKey) {
    updateMedia(item.id, { status: 'error', error: 'Add your API key to upload' });
    needsKey();
    return;
  }
  try {
    const res = await api.upload(item.file!, (progress) => updateMedia(item.id, { progress }));
    updateMedia(item.id, { status: 'ready', url: res.url, progress: 100 });
  } catch (e) {
    updateMedia(item.id, { status: 'error', error: e instanceof Error ? e.message : 'Upload failed' });
  }
}

export function retryUpload(id: string): void {
  const item = useComposer.getState().media.find((m) => m.id === id);
  if (!item?.file) return;
  useComposer.getState().removeMedia(id);
  void uploadItem({ ...item, id: uid(), previewUrl: URL.createObjectURL(item.file), status: 'uploading', progress: 0, error: undefined });
}
