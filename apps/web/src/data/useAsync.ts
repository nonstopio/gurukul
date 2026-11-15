import { useCallback, useEffect, useState } from 'react';

/** `retry`, when present, runs the load again (the screen shows `loading` until it lands). */
export type Loadable<T> =
  | { state: 'loading' }
  | { state: 'ready'; value: T }
  | { state: 'error'; error: Error; retry?: () => void };

/** The last ready value per `key`, for this tab only; `forgetAsync` empties it. */
const lastReady = new Map<string, unknown>();

/** Forgets every kept value: `AuthProvider` calls it whenever the signed-in person changes. */
export function forgetAsync(): void {
  lastReady.clear();
}

/**
 * Runs `load` when it changes (wrap it in `useCallback` with what it depends on). A failed load
 * carries `retry`, which runs it again.
 *
 * Without a `key`, a result that belongs to an earlier `load` is never shown: the hook reports
 * `loading` until the new one lands. With one, the last ready value for that key is shown while
 * the load runs, so the key must name everything the load depends on (the uid, and the audience
 * where the load uses it). The shown value can be one round trip behind the person's own latest
 * action, and a failed refresh keeps it with no error or Retry (the next visit tries again).
 */
export function useAsync<T>(load: () => Promise<T>, key?: string): Loadable<T> {
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const [result, setResult] = useState<{
    load: () => Promise<T>;
    attempt: number;
    loadable: Loadable<T>;
  } | null>(null);
  useEffect(() => {
    let live = true;
    load().then(
      (value) => {
        if (!live) return;
        if (key !== undefined) lastReady.set(key, value);
        setResult({ load, attempt, loadable: { state: 'ready', value } });
      },
      (e: unknown) =>
        live &&
        setResult({
          load,
          attempt,
          loadable: {
            state: 'error',
            error: e instanceof Error ? e : new Error(String(e)),
            retry,
          },
        }),
    );
    return () => {
      live = false;
    };
  }, [load, attempt, retry, key]);
  const current = result?.load === load && result.attempt === attempt ? result.loadable : undefined;
  const kept = key !== undefined && lastReady.has(key);
  if (kept && current?.state !== 'ready') return { state: 'ready', value: lastReady.get(key) as T };
  return current ?? { state: 'loading' };
}
