import { useEffect, useState } from 'react';
import { relativeTime } from './studioModel';
import type { DraftApi } from './useDraft';

/** How often "saved 3 min ago" is refreshed. */
export const TICK_MS = 30_000;

/**
 * The save state in words, led by `head`: "Draft v4 · saved just now", then "saving…" or
 * "unsaved changes" while the draft is in flight or dirty. The age comes from the draft's last
 * save and ticks on its own. A failed or conflicting save returns just the head; the page shows
 * its own wording for those. The head never shows the draft's `rev`: that counts saves, for the
 * conflict check, and is not a version anyone publishes.
 */
export function useSaveLabel(
  draft: Pick<DraftApi, 'save' | 'savedAt'>,
  head: string = 'Draft',
): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  if (draft.save === 'saving') return `${head} · saving…`;
  if (draft.save === 'dirty') return `${head} · unsaved changes`;
  if (draft.save === 'saved') {
    return draft.savedAt
      ? `${head} · saved ${relativeTime(draft.savedAt, now)}`
      : `${head} · saved`;
  }
  return head;
}
