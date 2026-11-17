import { MotionConfig } from 'motion/react';
import { useEffect } from 'react';
import { Composer } from './components/Composer';
import { Gallery } from './components/Gallery';
import { Lightbox } from './components/Lightbox';
import { ModelPalette } from './components/ModelPalette';
import { SettingsDialog } from './components/SettingsDialog';
import { TopBar } from './components/TopBar';
import { MOCK_MODE } from './lib/api';
import { focusPrompt, useGallery, useUI } from './lib/store';
import { generate, resumeAll, seedDemo } from './lib/tasks';
import { hasOpenLayer, Toaster } from './ui';

function isTyping(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

function useGlobalHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const ui = useUI.getState();
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ui.setPaletteOpen(!ui.paletteOpen);
        return;
      }
      if (mod && e.key === 'Enter') {
        // Never generate from behind a dialog, popover or lightbox.
        if (hasOpenLayer() || ui.lightboxId) return;
        e.preventDefault();
        void generate();
        return;
      }
      if (e.key === '/' && !mod && !isTyping(e.target) && !hasOpenLayer()) {
        e.preventDefault();
        focusPrompt();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export default function App() {
  useGlobalHotkeys();

  useEffect(() => {
    void useGallery
      .getState()
      .load()
      .then((items) => {
        resumeAll(items);
        if (MOCK_MODE && items.length === 0 && new URLSearchParams(location.search).get('seed') === '1') void seedDemo();
      });
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <TopBar />
      <main className="mx-auto max-w-[1800px] px-3 pt-2 pb-[260px] sm:px-6 sm:pb-[220px]">
        <Gallery />
      </main>
      <Composer />
      <ModelPalette />
      <SettingsDialog />
      <Lightbox />
      <Toaster />
    </MotionConfig>
  );
}
