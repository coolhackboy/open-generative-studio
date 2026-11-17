/**
 * PoYo API client (browser → api.poyo.ai, CORS open). This is the only module that knows
 * the backend's wire format; swap it to point the studio at another provider.
 *
 * Every response carries a business `code` (200 = ok). Some errors arrive with HTTP 200 and
 * `code: 400`, so both the HTTP status and the body code are checked.
 */
import { config } from '../config';
import type { FileKind, TaskState } from './types';

export interface SubmitResult {
  taskId: string;
  status: TaskState;
}

export interface TaskStatus {
  taskId: string;
  status: TaskState;
  progress: number;
  files: { url: string; type: FileKind }[];
  credits?: number;
  error?: string;
}

export interface UploadResult {
  url: string;
  expiresAt?: string;
}

export interface ApiClient {
  submit(model: string, input: Record<string, unknown>): Promise<SubmitResult>;
  status(taskId: string): Promise<TaskStatus>;
  upload(file: File, onProgress?: (pct: number) => void): Promise<UploadResult>;
}

export class ApiError extends Error {
  readonly code: number;
  /** Seconds to wait before retrying (from a Retry-After header), when the server sent one. */
  readonly retryAfter?: number;
  constructor(message: string, code: number, retryAfter?: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(0, secs);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, (date - Date.now()) / 1000) : undefined;
}

const HINTS: Record<number, string> = {
  400: 'Invalid parameters',
  401: 'Invalid or missing API key — check Settings',
  402: 'Insufficient credits — top up your PoYo balance',
  403: 'Permission denied',
  404: 'Not found',
  408: 'Request timed out',
  413: 'File too large',
  429: 'Rate limited — please slow down and retry',
  500: 'Server error',
  502: 'Upstream provider error',
  503: 'Service unavailable',
};

interface Envelope {
  code?: number;
  message?: string;
  msg?: string;
  detail?: unknown;
  error?: unknown;
  data?: unknown;
}

function serverMessage(body: Envelope | null): string | undefined {
  if (!body) return undefined;
  if (typeof body.message === 'string' && body.message) return body.message;
  if (typeof body.msg === 'string' && body.msg) return body.msg;
  if (typeof body.detail === 'string') return body.detail;
  if (Array.isArray(body.detail)) {
    return body.detail
      .map((d) => (d && typeof d === 'object' && 'msg' in d ? String((d as { msg: unknown }).msg) : String(d)))
      .join('; ');
  }
  if (typeof body.error === 'string') return body.error;
  if (body.error && typeof body.error === 'object' && 'message' in body.error)
    return String((body.error as { message: unknown }).message);
  return undefined;
}

function toError(httpStatus: number, body: Envelope | null, retryAfter?: number): ApiError {
  const code = typeof body?.code === 'number' && body.code !== 200 ? body.code : httpStatus;
  const hint = HINTS[code];
  const msg = serverMessage(body);
  const text = msg && hint && !msg.toLowerCase().includes(hint.toLowerCase().split(' ')[0])
    ? `${hint}: ${msg}`
    : (msg ?? hint ?? `Request failed (${code})`);
  return new ApiError(text, code, retryAfter);
}

async function parse(res: Response): Promise<unknown> {
  let body: Envelope | null = null;
  try {
    body = (await res.json()) as Envelope;
  } catch {
    body = null;
  }
  if (!res.ok || !body || (typeof body.code === 'number' && body.code !== 200))
    throw toError(res.status, body, parseRetryAfter(res.headers.get('Retry-After')));
  return body.data;
}

const offlineMessage = () =>
  typeof navigator !== 'undefined' && navigator.onLine === false
    ? "You're offline — nothing was sent"
    : 'Network error — couldn’t reach the API';

/** fetch() that turns network failures ("Failed to fetch") into a readable ApiError. */
async function net(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new ApiError(offlineMessage(), 0);
  }
}

function asState(s: unknown): TaskState {
  return s === 'running' || s === 'finished' || s === 'failed' ? s : 'not_started';
}

function asKind(t: unknown, url: string): FileKind {
  if (t === 'image' || t === 'video' || t === 'audio') return t;
  if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) return 'video';
  if (/\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(url)) return 'image';
  if (/\.(mp3|wav|m4a|ogg)(\?|$)/i.test(url)) return 'audio';
  return 'other';
}

export function createPoyoClient(getAuth: () => { apiKey: string; baseUrl: string }): ApiClient {
  const headers = (json: boolean): HeadersInit => {
    const h: Record<string, string> = { Authorization: `Bearer ${getAuth().apiKey}` };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  };
  const url = (path: string) => `${getAuth().baseUrl}${path}`;

  return {
    async submit(model, input) {
      const res = await net(url('/api/generate/submit'), {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify({ model, input }),
      });
      const data = (await parse(res)) as { task_id?: string; status?: string } | undefined;
      if (!data?.task_id) throw new ApiError('The API did not return a task id', 500);
      return { taskId: data.task_id, status: asState(data.status) };
    },

    async status(taskId) {
      const res = await net(url(`/api/generate/status/${encodeURIComponent(taskId)}`), {
        headers: headers(false),
      });
      const d = ((await parse(res)) ?? {}) as {
        status?: string;
        progress?: number;
        files?: { file_url?: string; url?: string; file_type?: string }[];
        credits_amount?: number;
        error_message?: string | null;
      };
      const files = (d.files ?? [])
        .map((f) => ({ url: f.file_url ?? f.url ?? '', type: f.file_type }))
        .filter((f) => f.url)
        .map((f) => ({ url: f.url, type: asKind(f.type, f.url) }));
      return {
        taskId,
        status: asState(d.status),
        progress: typeof d.progress === 'number' ? d.progress : 0,
        files,
        credits: typeof d.credits_amount === 'number' ? d.credits_amount : undefined,
        error: d.error_message ?? undefined,
      };
    },

    upload(file, onProgress) {
      // XHR (not fetch) so we can report upload progress.
      return new Promise<UploadResult>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url('/api/common/upload/stream'));
        xhr.setRequestHeader('Authorization', `Bearer ${getAuth().apiKey}`);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onerror = () => reject(new ApiError(offlineMessage(), 0));
        xhr.onload = () => {
          let body: Envelope | null = null;
          try {
            body = JSON.parse(xhr.responseText) as Envelope;
          } catch {
            body = null;
          }
          const ok = xhr.status >= 200 && xhr.status < 300 && body && (body.code == null || body.code === 200);
          if (!ok) return reject(toError(xhr.status, body, parseRetryAfter(xhr.getResponseHeader('Retry-After'))));
          const d = (body?.data ?? {}) as { file_url?: string; url?: string; download_url?: string; expires_at?: string };
          const fileUrl = d.file_url ?? d.url ?? d.download_url;
          if (!fileUrl) return reject(new ApiError('Upload succeeded but no URL was returned', 500));
          resolve({ url: fileUrl, expiresAt: d.expires_at });
        };
        const form = new FormData();
        form.append('file', file);
        xhr.send(form);
      });
    },
  };
}

// ---------------------------------------------------------------- mock mode

function detectMock(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    const p = new URLSearchParams(window.location.search).get('mock');
    if (p === '1' || p === 'true') sessionStorage.setItem('ogs.mock', '1');
    else if (p === '0' || p === 'false') sessionStorage.removeItem('ogs.mock');
    return sessionStorage.getItem('ogs.mock') === '1';
  } catch {
    return false;
  }
}

/** True in `vite dev` with `?mock=1` (sticky for the tab). Always false in production builds. */
export const MOCK_MODE = detectMock();

function createMockClient(): ApiClient {
  const load = () => import('./mock');
  return {
    submit: async (model, input) => (await load()).submit(model, input),
    status: async (taskId) => (await load()).status(taskId),
    upload: async (file, onProgress) => (await load()).upload(file, onProgress),
  };
}

let authSource: () => { apiKey: string; baseUrl: string } = () => ({
  apiKey: '',
  baseUrl: config.defaultApiBase,
});

/** Wire the client to the settings store (called once at startup). */
export function setAuthSource(fn: () => { apiKey: string; baseUrl: string }): void {
  authSource = fn;
}

export const api: ApiClient =
  import.meta.env.DEV && MOCK_MODE ? createMockClient() : createPoyoClient(() => authSource());
