import type { Category } from '../types/catalog';

export type TaskState = 'not_started' | 'running' | 'finished' | 'failed';

/** Local lifecycle: `submitting` exists only before the API returned a task id. */
export type GenerationStatus = 'submitting' | TaskState;

export type FileKind = 'image' | 'video' | 'audio' | 'other';

export interface GenerationFile {
  url: string;
  type: FileKind;
}

export interface Generation {
  /** Local id (stable across retries). */
  id: string;
  taskId?: string;
  /** Catalog model id, e.g. "seedance-2-5-flash". */
  modelId: string;
  /** API model id sent to submit, e.g. "seedance-2.5-flash". */
  variant: string;
  modelName: string;
  variantLabel?: string;
  category: Category;
  prompt: string;
  /** Exact `input` object sent to the API. */
  input: Record<string, unknown>;
  status: GenerationStatus;
  progress: number;
  files: GenerationFile[];
  error?: string;
  /** credits_amount reported by the API. */
  credits?: number;
  /** Client-side estimate at submit time. */
  estimateUSD?: number;
  /** Width / height of the first output (measured), or an estimate from params. */
  aspect?: number;
  createdAt: number;
  updatedAt: number;
  finishedAt?: number;
  apiBase: string;
  mock?: boolean;
}

export const TERMINAL: ReadonlySet<GenerationStatus> = new Set(['finished', 'failed']);

export function isTerminal(status: GenerationStatus): boolean {
  return TERMINAL.has(status);
}
