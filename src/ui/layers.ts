import { useEffect, useRef } from 'react';

/**
 * Escape-key layer stack: only the top-most open layer (dialog, popover, menu) handles Esc,
 * so nested overlays close one at a time.
 */
type Handler = () => void;
const stack: { id: number; handler: { current: Handler } }[] = [];
let nextId = 1;
let listening = false;

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || stack.length === 0) return;
  e.preventDefault();
  e.stopPropagation();
  stack[stack.length - 1].handler.current();
}

export function useEscapeLayer(active: boolean, onEscape: Handler): void {
  const ref = useRef(onEscape);
  useEffect(() => {
    ref.current = onEscape;
  });
  useEffect(() => {
    if (!active) return;
    const id = nextId++;
    stack.push({ id, handler: ref });
    if (!listening) {
      document.addEventListener('keydown', onKeyDown, true);
      listening = true;
    }
    return () => {
      const i = stack.findIndex((l) => l.id === id);
      if (i !== -1) stack.splice(i, 1);
    };
  }, [active]);
}

export function hasOpenLayer(): boolean {
  return stack.length > 0;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('disabled') && el.getClientRects().length > 0,
  );
}
