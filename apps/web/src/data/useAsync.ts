import { useCallback, useEffect, useState } from 'react';

/** `retry`, when present, runs the load again (the screen shows `loading` until it lands). */
export type Loadable<T> =
  | { state: 'loading' }
  | { state: 'ready'; value: T }
  | { state: 'error'; error: Error; retry?: () => void };

/**
 * Runs `load` when it changes (wrap it in `useCallback` with what it depends on). A result that
 * belongs to an earlier `load` is never shown: the hook reports `loading` until the new one lands.
 * A failed load carries `retry`, which runs it again.
 */
export function useAsync<T>(load: () => Promise<T>): Loadable<T> {
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
      (value) => live && setResult({ load, attempt, loadable: { state: 'ready', value } }),
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
  }, [load, attempt, retry]);
  return result?.load === load && result.attempt === attempt
    ? result.loadable
    : { state: 'loading' };
}
