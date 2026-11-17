import { clear, createStore, del, set, values } from 'idb-keyval';
import { MOCK_MODE } from './api';
import type { Generation } from './types';

/** Generations live in IndexedDB. Mock mode uses its own database so demo data never mixes in. */
const store = MOCK_MODE ? createStore('ogs-mock', 'generations') : createStore('ogs', 'generations');

export const db = {
  async all(): Promise<Generation[]> {
    try {
      return await values<Generation>(store);
    } catch {
      return [];
    }
  },
  put(gen: Generation): Promise<void> {
    return set(gen.id, gen, store).catch(() => undefined);
  },
  remove(id: string): Promise<void> {
    return del(id, store).catch(() => undefined);
  },
  clear(): Promise<void> {
    return clear(store).catch(() => undefined);
  },
};

/** localStorage helpers that never throw (private mode, quota, blocked storage). */
export const local = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
  getJSON<T>(key: string): T | undefined {
    const raw = local.get(key);
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  },
  setJSON(key: string, value: unknown): void {
    local.set(key, JSON.stringify(value));
  },
};
