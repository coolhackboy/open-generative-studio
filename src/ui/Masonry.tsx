import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export interface MasonryProps<T> {
  items: T[];
  getKey: (item: T) => string;
  /** width / height of each item; drives the layout without measuring the DOM. */
  getAspect: (item: T) => number;
  render: (item: T, size: { width: number; height: number }) => ReactNode;
  /** Column count for a container width. */
  columns?: (width: number) => number;
  gap?: number;
  className?: string;
}

const defaultColumns = (w: number) => (w < 560 ? 2 : w < 900 ? 3 : w < 1400 ? 4 : 5);

/**
 * Absolutely-positioned masonry. Items keep source order across the top row
 * (newest first reads left → right) and glide to new positions when the set changes.
 */
export function Masonry<T>({
  items,
  getKey,
  getAspect,
  render,
  columns = defaultColumns,
  gap = 12,
  className,
}: MasonryProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    if (!width) return { boxes: [] as { key: string; x: number; y: number; w: number; h: number; item: T }[], height: 0 };
    const cols = Math.max(1, columns(width));
    const colW = (width - gap * (cols - 1)) / cols;
    const heights = new Array<number>(cols).fill(0);
    const boxes = items.map((item) => {
      const aspect = Math.min(3, Math.max(0.33, getAspect(item) || 1));
      const h = Math.round(colW / aspect);
      let c = 0;
      for (let i = 1; i < cols; i++) if (heights[i] < heights[c] - 1) c = i;
      const box = { key: getKey(item), x: c * (colW + gap), y: heights[c], w: colW, h, item };
      heights[c] += h + gap;
      return box;
    });
    return { boxes, height: Math.max(0, ...heights) - gap };
  }, [items, width, columns, gap, getAspect, getKey]);

  return (
    <div ref={ref} className={className} style={{ position: 'relative', height: layout.height }}>
      {layout.boxes.map((b) => (
        <div
          key={b.key}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: b.w,
            height: b.h,
            transform: `translate3d(${b.x}px, ${b.y}px, 0)`,
            transition: 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1), height 420ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          {render(b.item, { width: b.w, height: b.h })}
        </div>
      ))}
    </div>
  );
}
