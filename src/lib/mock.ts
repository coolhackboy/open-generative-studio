/**
 * Dev-only mock backend (`?mock=1`). Simulates submit / status / upload so every gallery
 * state can be seen without an API key or spending credits. Never bundled in production:
 * `api.ts` only imports this module behind `import.meta.env.DEV`.
 *
 * Tips: a prompt containing "fail" produces a failed task; `?mock=1&seed=1` fills the
 * gallery with demo generations.
 */
import { findVariant } from '../data/catalog';
import type { SubmitResult, TaskStatus, UploadResult } from './api';
import { ApiError } from './api';
import type { Generation } from './types';

const S = 'https://storage.poyo.ai';

export const SAMPLE_IMAGES = [
  `${S}/ai-image-generator/header-owl-curator.webp`,
  `${S}/3d-generator/header-pangolin-architect.webp`,
  `${S}/audio-generator/header-whale-conductor.webp`,
  `${S}/avatar-generator/header-chameleon-performer.webp`,
  `${S}/models/nano-banana-2-1/poyo-cover-1614a15bf019.webp`,
  `${S}/models/flux-3-klein/poyo-cover-448f3fa62360.webp`,
  `${S}/models/gpt-image-2-6/poyo-cover-ff051220ea90.webp`,
  `${S}/models/seedream-5-5/poyo-cover-00e3e72fe961.webp`,
];

export const SAMPLE_VIDEOS = [
  `${S}/blog/kling-4-0-series-20261024/fox-video-d0100387a0e0.mp4`,
  `${S}/blog/kling-4-0-series-20261024/autumn-video-7d4d95be583a.mp4`,
  `${S}/blog/kling-4-0-series-20261024/baker-video-711cd3292e71.mp4`,
  `${S}/blog/kling-4-0-series-20261024/conservatory-video-d8acadb85c8a.mp4`,
  `${S}/blog/kling-4-0-series-20261024/market-seedance-2-5-333b9c414b16.mp4`,
  `${S}/blog/kling-4-0-series-20261024/product-ad-kling-4-0-1f31f48c87aa.mp4`,
];

interface MockTask {
  createdAt: number;
  model: string;
  input: Record<string, unknown>;
}

const TASKS_KEY = 'ogs.mock.tasks';

function loadTasks(): Record<string, MockTask> {
  try {
    return JSON.parse(localStorage.getItem(TASKS_KEY) ?? '{}') as Record<string, MockTask>;
  } catch {
    return {};
  }
}

function saveTasks(tasks: Record<string, MockTask>): void {
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return Math.abs(h);
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function submit(model: string, input: Record<string, unknown>): Promise<SubmitResult> {
  await delay(600);
  if (!findVariant(model)) throw new ApiError(`Unknown model: ${model}`, 400);
  const taskId = `mock_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const tasks = loadTasks();
  tasks[taskId] = { createdAt: Date.now(), model, input };
  saveTasks(tasks);
  return { taskId, status: 'not_started' };
}

export async function status(taskId: string): Promise<TaskStatus> {
  await delay(150);
  const task = loadTasks()[taskId];
  if (!task) throw new ApiError('Task not found', 404);
  const found = findVariant(task.model);
  const isVideo = found?.model.category === 'video';
  const total = isVideo ? 16000 : 7000;
  const elapsed = Date.now() - task.createdAt;
  const prompt = String(task.input.prompt ?? '');

  if (elapsed < 1500) return { taskId, status: 'not_started', progress: 0, files: [] };
  if (/\bfail/i.test(prompt) && elapsed > total * 0.4) {
    return {
      taskId,
      status: 'failed',
      progress: 0,
      files: [],
      error: 'Content moderation: the prompt was flagged by the provider (mock failure).',
    };
  }
  if (elapsed < total) {
    return { taskId, status: 'running', progress: Math.min(99, Math.floor((elapsed / total) * 100)), files: [] };
  }
  const seed = hash(taskId);
  const n = typeof task.input.n === 'number' ? task.input.n : 1;
  const files = isVideo
    ? [{ url: SAMPLE_VIDEOS[seed % SAMPLE_VIDEOS.length], type: 'video' as const }]
    : Array.from({ length: n }, (_, i) => ({
        url: SAMPLE_IMAGES[(seed + i) % SAMPLE_IMAGES.length],
        type: 'image' as const,
      }));
  return { taskId, status: 'finished', progress: 100, files, credits: isVideo ? 205 : 4 };
}

export async function upload(file: File, onProgress?: (pct: number) => void): Promise<UploadResult> {
  for (let p = 0; p <= 100; p += 20) {
    onProgress?.(p);
    await delay(180);
  }
  return { url: URL.createObjectURL(file) };
}

/** Builds a demo gallery covering finished, running and failed states. */
export function demoGenerations(apiBase: string): Generation[] {
  const now = Date.now();
  const tasks = loadTasks();
  const mk = (
    i: number,
    variant: string,
    prompt: string,
    extra: Partial<Generation> & { input?: Record<string, unknown> },
  ): Generation | null => {
    const found = findVariant(variant);
    if (!found) return null;
    const createdAt = now - i * 7 * 60_000;
    return {
      id: `demo-${i}`,
      taskId: `mock_demo_${i}`,
      modelId: found.model.id,
      variant,
      modelName: found.model.name,
      variantLabel: found.model.variants.length > 1 ? found.variant.label : undefined,
      category: found.model.category,
      prompt,
      input: { prompt, ...extra.input },
      status: 'finished',
      progress: 100,
      files: [],
      createdAt,
      updatedAt: createdAt,
      finishedAt: createdAt + 60_000,
      apiBase,
      mock: true,
      ...extra,
    };
  };
  const video = (i: number) => [{ url: SAMPLE_VIDEOS[i % SAMPLE_VIDEOS.length], type: 'video' as const }];
  const image = (i: number) => [{ url: SAMPLE_IMAGES[i % SAMPLE_IMAGES.length], type: 'image' as const }];

  const runningId = 'mock_demo_running';
  tasks[runningId] = {
    createdAt: now - 6000,
    model: 'seedance-2.5-flash',
    input: { prompt: 'Slow dolly through a rain-soaked neon alley, a fox pauses under a paper lantern', duration: 5 },
  };
  saveTasks(tasks);

  const list = [
    mk(0, 'seedance-2.5-flash', 'Slow dolly through a rain-soaked neon alley, a fox pauses under a paper lantern', {
      taskId: runningId,
      status: 'running',
      progress: 38,
      files: [],
      finishedAt: undefined,
      createdAt: now - 6000,
      input: { duration: 5, resolution: '720p', aspect_ratio: '16:9' },
    }),
    mk(1, 'nano-banana-2.1', 'Editorial portrait of an owl curator in a velvet museum hall, soft rim light', {
      files: image(0),
      input: { size: '1:1', resolution: '2K' },
      credits: 6,
    }),
    mk(2, 'kling-4.0', 'A fox walking through fresh snow at golden hour, telephoto, shallow depth of field', {
      files: video(0),
      input: { duration: 5, resolution: '1080p', aspect_ratio: '16:9' },
      credits: 212.5,
    }),
    mk(3, 'flux-3-klein', 'Macro shot of dew drops on a fern, studio backlight, 4K detail', {
      files: image(4),
      input: { size: '3:2', resolution: '2K', n: 1 },
      credits: 2.8,
    }),
    mk(4, 'seedance-2.5-flash', 'Autumn leaves swirling down a quiet cobblestone street, handheld camera', {
      files: video(5),
      input: { duration: 8, resolution: '720p', aspect_ratio: '16:9' },
      credits: 328,
    }),
    mk(5, 'nano-banana-2.1', 'Swiss-style poster, bold type “BLUE HOUR”, grain texture, cobalt and cream', {
      status: 'failed',
      progress: 0,
      files: [],
      error: 'Insufficient credits. Top up your PoYo balance and retry.',
      input: { size: '3:4', resolution: '2K' },
    }),
    mk(6, 'flux-3-klein', 'Pangolin architect drafting blueprints, warm desk lamp, cinematic still', {
      files: image(1),
      input: { size: '16:9', resolution: '1K' },
      credits: 1.8,
    }),
    mk(7, 'kling-4.0', 'A baker dusting flour over fresh loaves, morning light through the window', {
      files: video(2),
      input: { duration: 5, resolution: '720p', aspect_ratio: '16:9' },
      credits: 142.5,
    }),
    mk(8, 'nano-banana-2.1', 'Whale conductor leading an underwater orchestra, bioluminescent stage', {
      files: image(2),
      input: { size: '16:9', resolution: '1K' },
      credits: 4,
    }),
    mk(9, 'flux-3-klein', 'Chameleon stage performer under a single spotlight, theatrical haze', {
      files: image(3),
      input: { size: '1:1', resolution: '1K' },
      credits: 1.8,
    }),
    mk(10, 'seedance-2.5-flash', 'Steam rising from a busy night market, lanterns swaying, crowd ambience', {
      files: video(4),
      input: { duration: 6, resolution: '720p', aspect_ratio: '16:9' },
      credits: 246,
    }),
    mk(11, 'nano-banana-2.1', 'Ink-wash landscape of misty mountains with a lone red pavilion', {
      files: image(5),
      input: { size: '4:5', resolution: '1K' },
      credits: 4,
    }),
  ];
  return list.filter((g): g is Generation => g !== null);
}
