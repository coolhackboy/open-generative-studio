import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { config } from './config';
import { loadCatalog } from './data/catalog';
import './index.css';
import { initComposer } from './lib/store';
import { initTheme } from './ui';

/** VITE_ACCENT: derive hover / soft / foreground tokens from a single color. */
function applyAccent(color: string) {
  if (!color) return;
  const root = document.documentElement.style;
  root.setProperty('--accent', color);
  root.setProperty('--accent-hover', `color-mix(in oklab, ${color} 88%, white)`);
  root.setProperty('--accent-soft', `color-mix(in oklab, ${color} 14%, transparent)`);
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = color;
    const hex = ctx.fillStyle;
    const m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) return;
    const n = parseInt(m[1], 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    root.setProperty('--accent-fg', lum > 0.4 ? '#0b0b0c' : '#ffffff');
  } catch {
    /* keep defaults */
  }
}

initTheme();
applyAccent(config.accent);

const root = createRoot(document.getElementById('root')!);

loadCatalog()
  .then(() => {
    initComposer();
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((err: unknown) => {
    console.error(err);
    root.render(
      <div style={{ padding: 32, fontFamily: 'system-ui', color: 'var(--fg)' }}>
        Failed to load the model catalog. Please reload the page.
      </div>,
    );
  });
