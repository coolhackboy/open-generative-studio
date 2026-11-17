import type { ReactNode } from 'react';
import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'danger';

export interface ToastItem {
  id: number;
  title: ReactNode;
  description?: ReactNode;
  tone: ToastTone;
  action?: { label: string; onClick: () => void };
}

interface ToastState {
  items: ToastItem[];
  push: (t: Omit<ToastItem, 'id'>, ms?: number) => number;
  dismiss: (id: number) => void;
}

let seq = 1;

export const useToasts = create<ToastState>((set, get) => ({
  items: [],
  push: (t, ms = 4500) => {
    const id = seq++;
    set({ items: [...get().items.slice(-3), { ...t, id }] });
    if (ms > 0) setTimeout(() => get().dismiss(id), ms);
    return id;
  },
  dismiss: (id) => set({ items: get().items.filter((t) => t.id !== id) }),
}));

export const toast = {
  show: (t: { title: ReactNode; description?: ReactNode; tone?: ToastTone; action?: ToastItem['action'] }, ms?: number) =>
    useToasts.getState().push({ tone: 'info', ...t }, ms),
  success: (title: ReactNode, description?: ReactNode) => toast.show({ title, description, tone: 'success' }, 2500),
  error: (title: ReactNode, description?: ReactNode) => toast.show({ title, description, tone: 'danger' }),
  dismiss: (id: number) => useToasts.getState().dismiss(id),
};
