import { useCallback, useSyncExternalStore } from 'react';
import { safeStorage } from '../theme';

/** What this person has done with tips, in this browser. */
export interface TipState {
  off: boolean;
  /** Dismissed for good ("Got it", or using the feature). */
  done: string[];
  /** Already opened by themselves once: from then on the dot waits to be clicked. */
  opened: string[];
}

export const tipsKey = (uid: string) => `gurukul-tips:${uid}`;

const listeners = new Set<() => void>();

const ids = (a: unknown): string[] =>
  Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : [];

/**
 * The saved state; nothing saved means every tip is on. `null` when storage is missing or blocked:
 * without memory a tip would reopen on every page, so that means no tips at all.
 */
export function readTips(uid: string): TipState | null {
  let raw: string | null | undefined;
  try {
    raw = safeStorage()?.getItem(tipsKey(uid));
  } catch {
    return null;
  }
  if (raw === undefined) return null;
  let saved: Partial<TipState> | null = null;
  try {
    saved = JSON.parse(raw ?? 'null') as Partial<TipState> | null;
  } catch {
    // Malformed: the defaults.
  }
  return { off: saved?.off === true, done: ids(saved?.done), opened: ids(saved?.opened) };
}

/** Changes the saved state and tells every `useTipsSwitch`. A failed save only loses this change. */
export function updateTips(uid: string, change: (state: TipState) => TipState): void {
  const state = readTips(uid);
  if (!state) return;
  try {
    safeStorage()?.setItem(tipsKey(uid), JSON.stringify(change(state)));
  } catch {
    // Not saved: the tip shows again next visit.
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** The Profile switch: on shows every tip not yet dismissed; turning it on again starts them all over. */
export function useTipsSwitch(uid: string) {
  const mode = useSyncExternalStore(subscribe, () => {
    const state = readTips(uid);
    return state ? (state.off ? 'off' : 'on') : 'none';
  });
  const set = useCallback(
    (on: boolean) =>
      updateTips(uid, (s) => (on ? { off: false, done: [], opened: [] } : { ...s, off: true })),
    [uid],
  );
  return { on: mode === 'on', available: mode !== 'none', set };
}
