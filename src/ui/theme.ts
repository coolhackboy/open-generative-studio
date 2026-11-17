import { create } from 'zustand';

export type ThemePref = 'system' | 'dark' | 'light';

const KEY = 'ui.theme';

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'dark' || v === 'light' ? v : 'system';
  } catch {
    return 'system';
  }
}

function apply(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === 'system') delete root.dataset.theme;
  else root.dataset.theme = pref;
  // Keep the browser chrome color in sync with the forced theme; restore originals for "system".
  const bg = pref === 'system' ? '' : getComputedStyle(root).getPropertyValue('--bg').trim();
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    if (m.dataset.original == null) m.dataset.original = m.content;
    m.content = bg || m.dataset.original;
  });
}

interface ThemeState {
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
}

/** Theme preference, persisted to localStorage and applied as <html data-theme>. */
export const useTheme = create<ThemeState>((set) => ({
  pref: read(),
  setPref: (pref) => {
    try {
      if (pref === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, pref);
    } catch {
      /* ignore */
    }
    apply(pref);
    set({ pref });
  },
}));

export function initTheme(): void {
  apply(read());
  window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => apply(useTheme.getState().pref));
}

/** Resolved theme right now (for icons). */
export function resolvedTheme(pref: ThemePref): 'dark' | 'light' {
  if (pref !== 'system') return pref;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
