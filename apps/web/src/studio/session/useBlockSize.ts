import { useEffect, useState } from 'react';

/**
 * The height of `element` in CSS pixels, kept current as it changes; null until it is measured, and
 * without `ResizeObserver` (tests). The session workspace measures its top bar with it, because a
 * long session title wraps the bar to two or three lines and the sticky chat must sit below it.
 */
export function useBlockSize(element: HTMLElement | null): number | null {
  const [size, setSize] = useState<number | null>(null);
  useEffect(() => {
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() =>
      setSize(Math.ceil(element.getBoundingClientRect().height)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return size;
}
