import { create } from 'zustand';
import { toast } from '../ui/toast';
import { local } from './db';
import { onFinished } from './tasks';
import type { Generation } from './types';

/**
 * Completion "loop": unseen results badge the tab title ("(2) ✓") and favicon (lime dot),
 * and — only after the first video finishes while the tab is hidden — we offer browser
 * notifications via a toast (the permission prompt runs from that click).
 */

interface AttentionState {
  unseen: string[];
  /** Generations that finished in this session (for the completion animation). */
  justFinished: string[];
  markSeen: (id: string) => void;
}

export const useAttention = create<AttentionState>((set, get) => ({
  unseen: [],
  justFinished: [],
  markSeen: (id) => {
    if (!get().unseen.includes(id)) return;
    set({ unseen: get().unseen.filter((x) => x !== id) });
  },
}));

const ASKED_KEY = 'ogs.notifyAsked';
let baseTitle = '';
let baseIcon = '';
let pendingAsk = false;

function iconLink(): HTMLLinkElement | null {
  return document.querySelector<HTMLLinkElement>('link[rel="icon"]');
}

async function badgeFavicon(on: boolean): Promise<void> {
  const link = iconLink();
  if (!link) return;
  if (!baseIcon) baseIcon = link.href;
  if (!on) {
    link.href = baseIcon;
    return;
  }
  try {
    const img = new Image();
    img.src = baseIcon;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, 64, 64);
    ctx.beginPath();
    ctx.arc(50, 14, 13, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0a0b';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(50, 14, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#b5f23d';
    ctx.fill();
    link.href = c.toDataURL('image/png');
  } catch {
    /* keep the plain icon */
  }
}

function render(unseen: number): void {
  if (!baseTitle) baseTitle = document.title.replace(/^\(\d+\) ✓ /, '');
  document.title = unseen > 0 ? `(${unseen}) ✓ ${baseTitle}` : baseTitle;
  void badgeFavicon(unseen > 0);
}

function notify(gen: Generation): void {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    try {
      const n = new Notification(`${gen.category === 'video' ? 'Video' : 'Image'} ready · ${gen.modelName}`, {
        body: gen.prompt.slice(0, 140),
        icon: baseIcon || iconLink()?.href,
        tag: gen.id,
      });
      n.onclick = () => window.focus();
    } catch {
      /* some browsers only allow notifications from a service worker */
    }
  } else if (Notification.permission === 'default' && gen.category === 'video' && !local.get(ASKED_KEY)) {
    pendingAsk = true;
  }
}

function offerNotifications(): void {
  if (!pendingAsk) return;
  pendingAsk = false;
  local.set(ASKED_KEY, '1');
  toast.show(
    {
      title: 'Your video finished while you were away',
      description: 'Get a browser notification next time a long generation completes?',
      tone: 'info',
      action: { label: 'Enable notifications', onClick: () => void Notification.requestPermission() },
    },
    12000,
  );
}

/** Wire listeners once at startup. */
export function initAttention(): void {
  baseTitle = document.title;
  useAttention.subscribe((s, prev) => {
    if (s.unseen.length !== prev.unseen.length) render(s.unseen.length);
  });
  onFinished((gen) => {
    const s = useAttention.getState();
    useAttention.setState({
      justFinished: [...s.justFinished, gen.id],
      unseen: s.unseen.includes(gen.id) ? s.unseen : [...s.unseen, gen.id],
    });
    if (document.hidden) notify(gen);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) offerNotifications();
  });
}
