import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

/**
 * A tab kept in `?tab=`, so a reload or a shared link lands on it. A missing or unknown value is
 * the first tab, which is written as no parameter. Other parameters stay. Changes replace the
 * entry, so Back leaves the page instead of walking through the tabs.
 */
export function useTabParam<T extends string>(ids: readonly [T, ...T[]]): [T, (tab: T) => void] {
  const [params, setParams] = useSearchParams();
  const named = params.get('tab');
  const tab = ids.find((id) => id === named) ?? ids[0];
  const setTab = useCallback(
    (next: T) =>
      setParams(
        (current) => {
          const copy = new URLSearchParams(current);
          if (next === ids[0]) copy.delete('tab');
          else copy.set('tab', next);
          return copy;
        },
        { replace: true },
      ),
    [ids, setParams],
  );
  return [tab, setTab];
}
