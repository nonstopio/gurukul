import { useSyncExternalStore } from 'react';
import type { Update } from './boot';

/**
 * The latest update the version check found, for `UpdatePrompt`. `main.tsx` sets it from
 * `checkForNewBuild`; nothing else does, so it lives outside React.
 */
let current: Update | null = null;
const listeners = new Set<() => void>();

export function setUpdate(update: Update | null): void {
  current = update;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useUpdate(): Update | null {
  return useSyncExternalStore(subscribe, () => current);
}
