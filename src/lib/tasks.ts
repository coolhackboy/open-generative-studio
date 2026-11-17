import { findVariant, getModel, getVariant, models } from '../data/catalog';
import { toast } from '../ui/toast';
import { api, ApiError, MOCK_MODE } from './api';
import { estimateCost } from './cost';
import { local } from './db';
import { uid } from './format';
import { buildInput, estimateAspect, getMediaFields, validateInput, type MediaKind } from './schema';
import { useComposer, useGallery, useSettings, useUI, type MediaItem } from './store';
import { isTerminal, type Generation } from './types';

// ---------------------------------------------------------------- completion listeners

type FinishListener = (gen: Generation) => void;
const finishListeners = new Set<FinishListener>();

/** Subscribe to generations reaching `finished` (used for title badge, notifications, motion). */
export function onFinished(fn: FinishListener): () => void {
  finishListeners.add(fn);
  return () => finishListeners.delete(fn);
}

// ---------------------------------------------------------------- ETA history (this device)

const DURATIONS_KEY = 'ogs.durations';

function recordDuration(variant: string, ms: number): void {
  if (!(ms > 0)) return;
  const all = local.getJSON<Record<string, number[]>>(DURATIONS_KEY) ?? {};
  all[variant] = [...(all[variant] ?? []), Math.round(ms)].slice(-8);
  local.setJSON(DURATIONS_KEY, all);
}

/** Median duration of past successful runs of this variant on this device, if any. */
export function etaFor(variant: string): number | undefined {
  const list = local.getJSON<Record<string, number[]>>(DURATIONS_KEY)?.[variant];
  if (!list?.length) return undefined;
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// ---------------------------------------------------------------- polling

const FAST_MS = 3000;
const SLOW_MS = 8000;
const SLOW_AFTER_MS = 60_000;
const MAX_BACKOFF_MS = 60_000;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const failures = new Map<string, number>();

function schedule(id: string, ms: number): void {
  clearTimeout(timers.get(id));
  timers.set(id, setTimeout(() => void tick(id), ms));
}

const jitter = (min: number, max: number) => min + Math.random() * (max - min);

function nextDelay(gen: Generation, retryAfterSec?: number): number {
  const errs = failures.get(gen.id) ?? 0;
  if (retryAfterSec != null) return Math.min(MAX_BACKOFF_MS, retryAfterSec * 1000 + jitter(250, 1500));
  if (errs > 0) return Math.min(MAX_BACKOFF_MS, SLOW_MS * 2 ** (errs - 1) + jitter(0, 1000));
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
    // Some models report 0 credits until the task is done; only record meaningful values.
    if (s.credits != null && (s.credits > 0 || s.status === 'finished')) patch.credits = s.credits;
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
    if (patch.status === 'finished') {
      recordDuration(gen.variant, (patch.finishedAt ?? Date.now()) - gen.createdAt);
      const done = useGallery.getState().items.find((g) => g.id === id);
      if (done) finishListeners.forEach((fn) => fn(done));
    }
    if (!isTerminal(patch.status ?? gen.status)) schedule(id, nextDelay(gen));
  } catch (e) {
    // Auth / not-found errors are final; rate limits, network and 5xx errors back off and retry.
    if (e instanceof ApiError && (e.code === 401 || e.code === 403 || e.code === 404)) {
      useGallery.getState().patch(id, { status: 'failed', error: e.message });
      return;
    }
    failures.set(id, (failures.get(id) ?? 0) + 1);
    const retryAfter = e instanceof ApiError && e.code === 429 ? (e.retryAfter ?? undefined) : undefined;
    schedule(id, nextDelay(gen, retryAfter));
  }
}

export function track(id: string): void {
  failures.delete(id);
  schedule(id, FAST_MS);
}

/** On startup: resume polling for unfinished tasks (staggered so many tabs/tasks don't burst). */
export function resumeAll(items: Generation[]): void {
  let i = 0;
  for (const g of items) {
    if (isTerminal(g.status)) continue;
    if (g.taskId) schedule(g.id, jitter(1500, 3000) + i++ * 400);
    else useGallery.getState().remove(g.id); // interrupted before submission — nothing was sent
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
    patch(gen.id, { taskId: r.taskId, status: r.status, notSent: undefined });
    track(gen.id);
    return true;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Request failed';
    // The provider rejected (or never received) the request: nothing was billed, so don't keep an estimate.
    patch(gen.id, { status: 'failed', error: message, notSent: true, estimateUSD: undefined });
    toast.show({ title: 'Not sent — nothing billed', description: message, tone: 'danger' });
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
    c.flagInvalid(problems[0].field);
    toast.show({
      title: problems[0].message,
      description: problems
        .slice(1)
        .map((p) => p.message)
        .join(' '),
      tone: 'danger',
    });
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
  const found = findVariant(old.variant);
  await submitGeneration({
    ...old,
    taskId: undefined,
    status: 'submitting',
    progress: 0,
    files: [],
    error: undefined,
    notSent: undefined,
    credits: undefined,
    finishedAt: undefined,
    estimateUSD: found ? estimateCost(found.variant, old.input)?.usd : old.estimateUSD,
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

// ---------------------------------------------------------------- follow-up actions

interface Target {
  modelId: string;
  variant: string;
  field: string;
}

/** Find a model/variant with an image input, preferring the current model, then a short list. */
function findImageTarget(category: 'video' | 'image', prefer: string[], wantEdit: boolean): Target | undefined {
  const c = useComposer.getState();
  const current = getModel(c.modelId);
  const candidates = [
    ...(current && current.category === category ? [current] : []),
    ...prefer.map((id) => getModel(id)).filter((m): m is NonNullable<typeof m> => !!m),
    ...models.filter((m) => m.category === category && m.featured),
    ...models.filter((m) => m.category === category),
  ];
  for (const m of candidates) {
    const variants = [...m.variants].sort((a, b) => {
      const score = (v: typeof a) =>
        (wantEdit ? /edit/i.test(`${v.model} ${v.label}`) : /image.to.video|i2v|first/i.test(`${v.model} ${v.label}`)) ? 0 : 1;
      return score(a) - score(b);
    });
    for (const v of variants) {
      const field = getMediaFields(v, m.category).find((f) => f.kind === 'image' && !/mask|last|end/i.test(f.name));
      if (field) return { modelId: m.id, variant: v.model, field: field.name };
    }
  }
  return undefined;
}

function loadTarget(t: Target, url: string, prompt: string): void {
  const c = useComposer.getState();
  c.applyPreset({ modelId: t.modelId, variant: t.variant, input: { prompt } });
  addRemoteReference(url, 'image', t.field);
  requestAnimationFrame(() => document.getElementById('prompt-input')?.focus());
}

/** Image → video: open an image-to-video model with this image as the first frame. */
export function animateImage(url: string, prompt: string): void {
  const t = findImageTarget('video', ['seedance-2-5-flash', 'kling-4-0', 'veo-3-1'], false);
  if (!t) return void toast.show({ title: 'No video model accepts an image', tone: 'danger' });
  loadTarget(t, url, prompt ? `Bring this to life: ${prompt}` : '');
  toast.success(`Loaded into ${getModel(t.modelId)?.name ?? 'a video model'}`, 'Describe the motion, then generate.');
}

/** Open an image-edit model with this image attached. */
export function editImage(url: string): void {
  const t = findImageTarget('image', ['nano-banana-2-1', 'flux-3-klein', 'gpt-image-2-6', 'seedream-5-5'], true);
  if (!t) return void toast.show({ title: 'No edit model available', tone: 'danger' });
  loadTarget(t, url, '');
  toast.success(`Loaded into ${getModel(t.modelId)?.name ?? 'an edit model'}`, 'Describe the change you want.');
}

/** Attach an output to the current model's matching reference input (switching models if needed). */
export function attachAsReference(url: string, kind: MediaKind): void {
  if (addRemoteReference(url, kind)) {
    toast.success('Added as a reference');
    requestAnimationFrame(() => document.getElementById('prompt-input')?.focus());
    return;
  }
  if (kind !== 'image') return void toast.show({ title: `The current model doesn't accept ${kind} references`, tone: 'info' });
  const t = findImageTarget(useComposer.getState().modelId ? (getModel(useComposer.getState().modelId)?.category ?? 'image') : 'image', [], false);
  if (!t) return void toast.show({ title: 'No model accepts this reference', tone: 'info' });
  loadTarget(t, url, useComposer.getState().prompt);
  toast.success(`Switched to ${getModel(t.modelId)?.name} to use this reference`);
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
    if (media.some((m) => m.file && m.file.name === file.name && m.file.size === file.size)) {
      toast.show({ title: `${file.name} is already attached`, tone: 'info' }, 2500);
      continue;
    }
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

/** Attach an already-hosted URL (e.g. a previous output) as a reference. */
export function addRemoteReference(url: string, kind: MediaKind, targetField?: string): boolean {
  const c = useComposer.getState();
  const model = getModel(c.modelId);
  if (!model) return false;
  const fields = getMediaFields(getVariant(model, c.variant), model.category);
  if (c.media.some((m) => m.url === url)) return true;
  const used = (name: string) => c.media.filter((m) => m.field === name).length;
  const field = targetField
    ? fields.find((f) => f.name === targetField)
    : fields.find((f) => (f.kind === kind || f.kind === 'file') && used(f.name) < f.max);
  if (!field) return false;
  c.addMedia({
    id: uid(),
    field: field.name,
    kind,
    name: url.split('/').pop()?.split('?')[0] ?? 'reference',
    previewUrl: url,
    url,
    status: 'ready',
    progress: 100,
  });
  return true;
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
    const message = e instanceof Error ? e.message : 'Upload failed';
    updateMedia(item.id, { status: 'error', error: message });
    toast.show({
      title: `Couldn't upload ${item.name}`,
      description: message,
      tone: 'danger',
      action: { label: 'Retry upload', onClick: () => retryUpload(item.id) },
    });
  }
}

export function retryUpload(id: string): void {
  const item = useComposer.getState().media.find((m) => m.id === id);
  if (!item?.file) return;
  useComposer.getState().removeMedia(id);
  void uploadItem({ ...item, id: uid(), previewUrl: URL.createObjectURL(item.file), status: 'uploading', progress: 0, error: undefined });
}
