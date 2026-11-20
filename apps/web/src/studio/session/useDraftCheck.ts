import { useCallback, useEffect, useRef, useState } from 'react';
import { log } from '../../log';
import { useStudio } from '../StudioProvider';
import type { DraftDoc } from '../types';
import { draftCheck } from './save';
import type { DraftCheck, DraftRead } from './save';
import type { AgentSessionView } from './agent';

export interface DraftCheckApi {
  check: DraftCheck;
  /** Reads the stored draft again (Check again). */
  recheck(): void;
  /**
   * The stored draft as read elsewhere on the page, or null when it could not be: a save that found
   * it moved, or a new course's own draft found at its address (`DSK-28`). No read follows.
   */
  found(stored: DraftDoc | null): void;
}

/**
 * The stored draft against the session's base (`.plan/22-desktop-studio.md`, when the draft moved
 * underneath): read once when the page opens an open edit session, and again only when asked (Check
 * again) or found by a save. Mounted where the chat, Review and the editors share it, so moving
 * between them reads nothing more.
 */
export function useDraftCheck(
  session: AgentSessionView['session'],
  sessionId: string,
): DraftCheckApi {
  const { data } = useStudio();
  const [read, setRead] = useState<DraftRead | null>(null);
  const courseId = session?.courseId ?? null;
  const wanted = session?.status === 'open' && session.base !== null && courseId !== null;
  const asked = useRef(false);

  const readDraft = useCallback(
    (id: string) =>
      data.getDraft(id).then(
        (stored) => {
          if (!stored) log.warn('Session draft not found', { sessionId, courseId: id });
          setRead(stored ? { state: 'read', stored } : { state: 'failed' });
        },
        () => {
          log.warn('Session draft not checked', { sessionId, courseId: id });
          setRead({ state: 'failed' });
        },
      ),
    [data, sessionId],
  );

  // The one read a page makes when it opens the session; a Firestore read behind a ref, never
  // repeated because what it read differs from what the session holds.
  useEffect(() => {
    if (!wanted || asked.current) return;
    asked.current = true;
    void readDraft(courseId as string);
  }, [wanted, courseId, readDraft]);

  // Offered only on a failed check, which only an open edit session (with its course) has.
  const recheck = useCallback(() => {
    setRead({ state: 'checking' });
    void readDraft(courseId as string);
  }, [courseId, readDraft]);

  // Read by someone else on this page (a save, or a new course found at its address): the page's
  // one read is made.
  const found = useCallback((stored: DraftDoc | null) => {
    asked.current = true;
    setRead(stored ? { state: 'read', stored } : { state: 'failed' });
  }, []);

  return {
    check: session ? draftCheck(session, read) : { state: 'checking' },
    recheck,
    found,
  };
}
