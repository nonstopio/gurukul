import { useEffect, useState } from 'react';
import { relativeTime } from './studioModel';
import type { DraftApi } from './useDraft';

/** How often "saved 3 min ago" is refreshed. */
export const TICK_MS = 30_000;

/**
 * The save state in words, led by the draft's revision: "Draft v3 · saved just now", then
 * "saving…" or "unsaved changes" while the draft is in flight or dirty. The age comes from the
 * draft's last save and ticks on its own. A failed or conflicting save returns just the
 * revision; the page shows its own wording for those.
 */
export function useSaveLabel(draft: Pick<DraftApi, 'save' | 'rev' | 'savedAt'>): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  const head = `Draft v${draft.rev}`;
  if (draft.save === 'saving') return `${head} · saving…`;
  if (draft.save === 'dirty') return `${head} · unsaved changes`;
  if (draft.save === 'saved') {
    return draft.savedAt
      ? `${head} · saved ${relativeTime(draft.savedAt, now)}`
      : `${head} · saved`;
  }
  return head;
}
