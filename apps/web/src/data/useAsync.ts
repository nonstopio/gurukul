import { useEffect, useState } from 'react';

export type Loadable<T> =
  { state: 'loading' } | { state: 'ready'; value: T } | { state: 'error'; error: Error };

/**
 * Runs `load` when it changes (wrap it in `useCallback` with what it depends on). A result that
 * belongs to an earlier `load` is never shown: the hook reports `loading` until the new one lands.
 */
export function useAsync<T>(load: () => Promise<T>): Loadable<T> {
  const [result, setResult] = useState<{ load: () => Promise<T>; loadable: Loadable<T> } | null>(
    null,
  );
  useEffect(() => {
    let live = true;
    load().then(
      (value) => live && setResult({ load, loadable: { state: 'ready', value } }),
      (e: unknown) =>
        live &&
        setResult({
          load,
          loadable: { state: 'error', error: e instanceof Error ? e : new Error(String(e)) },
        }),
    );
    return () => {
      live = false;
    };
  }, [load]);
  return result?.load === load ? result.loadable : { state: 'loading' };
}
