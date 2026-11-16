import { useCallback, useEffect, useState } from 'react';
import { log } from '../log';
import type { LearnerData, ProgressRow } from './types';
import type { Loadable } from './useAsync';

/**
 * Live progress for one course: `loading` until the first snapshot, then `ready` with the row or
 * `null` (not started). A failed listener is `error` with `retry`, which listens again; it is
 * logged here, once, so the pages do not.
 */
export function useProgress(
  data: LearnerData,
  uid: string,
  courseId: string,
): Loadable<ProgressRow | null> {
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const key = `${uid}/${courseId}/${attempt}`;
  const [result, setResult] = useState<{ key: string; loadable: Loadable<ProgressRow | null> }>();
  useEffect(
    () =>
      data.watchProgress(
        uid,
        courseId,
        (value) => setResult({ key, loadable: { state: 'ready', value } }),
        (error) => {
          log.error('Progress listener failed', error, { courseId });
          setResult({ key, loadable: { state: 'error', error, retry } });
        },
      ),
    [data, uid, courseId, key, retry],
  );
  return result?.key === key ? result.loadable : { state: 'loading' };
}

/**
 * A page's data and its progress as one loadable: the page waits for both, so nothing is drawn
 * from "no progress" (0%, Start, Locked) before the real progress arrives. The page's own data
 * decides first; a failed progress read then shows the same warning and Retry.
 */
export function withProgress<T>(
  page: Loadable<T>,
  progress: Loadable<ProgressRow | null>,
): Loadable<[T, ProgressRow | null]> {
  if (page.state !== 'ready') return page;
  if (progress.state !== 'ready') return progress;
  return { state: 'ready', value: [page.value, progress.value] };
}
