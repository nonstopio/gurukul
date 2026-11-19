import { useSyncExternalStore } from 'react';

/**
 * The design system's large breakpoint (1024px): from here the chat and the preview sit side by
 * side; below it the chat is a drawer over the preview (`.plan/22-desktop-studio.md`, Width).
 */
const SIDE_BY_SIDE = '(min-width: 64rem)';

const query = () =>
  typeof window.matchMedia === 'function' ? window.matchMedia(SIDE_BY_SIDE) : null;

const subscribe = (notify: () => void) => {
  const q = query();
  q?.addEventListener('change', notify);
  return () => q?.removeEventListener('change', notify);
};

/** Without `matchMedia` (tests, old browsers) the panes sit side by side. */
const isWide = () => query()?.matches ?? true;

/** True while the window is wide enough for the chat beside the preview. */
export function useSideBySide(): boolean {
  return useSyncExternalStore(subscribe, isWide);
}
