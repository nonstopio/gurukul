import type { AuthoringSession } from '@gurukul/schema';
import { useCallback, useEffect, useRef } from 'react';
import type { DraftApi } from '../useDraft';
import type { Working } from '../types';
import { acquireAgentSession } from './useAgentSession';
import type { AgentSessionHandle } from './useAgentSession';
import type { AgentSessionOptions } from './agent';

/**
 * Milliseconds after the last hand edit before it is written to `session.json`. A local file, so a
 * short pause: closing the app loses at most this much, and no Firestore write is spent.
 */
export const HAND_EDIT_WRITE_MS = 1000;

const nothing = () => undefined;

/**
 * Editors just left, by session, whose hand edits become a turn on the next task unless an editor
 * on the same session mounts first and takes them over: React mounts twice in development, and a
 * linked image reports its size from its first effect, so ending at once would split one visit.
 */
const ending = new Map<
  string,
  { timer: ReturnType<typeof setTimeout>; held: ReturnType<typeof acquireAgentSession> }
>();

/**
 * Studio's `DraftApi` over a desktop session's working copy (`.plan/22-desktop-studio.md`, The
 * session workspace: Edit by hand), so `LessonEditor` and `QuizBuilder` edit it as they edit a
 * draft. An edit goes to the runtime's copy in memory (`edit`), and to `session.json` a pause later
 * (`keepEdits`); never to Firestore, and with no `rev` check, since nothing else writes the copy.
 * Leaving the editor makes the edits one turn by the Educator (`endEdits`, on the next task). There is no conflict and
 * no backup on this device: the session file is both.
 */
export function useSessionDraft(
  agent: AgentSessionHandle,
  session: AuthoringSession,
  work: Working,
  { desktop, uid, sessionId }: Pick<AgentSessionOptions, 'desktop' | 'uid' | 'sessionId'>,
): DraftApi {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { edit, keepEdits } = agent;

  // The editor's own hold on the runtime, so the turn is written even when this was the last
  // screen showing the session; the window going away writes what is not on disk yet.
  useEffect(() => {
    const key = `${uid}/${sessionId}`;
    const held = acquireAgentSession({ desktop, uid, sessionId });
    const left = ending.get(key);
    if (left) {
      clearTimeout(left.timer);
      ending.delete(key);
      left.held.release();
    }
    const keep = () => void held.session.keepEdits();
    window.addEventListener('pagehide', keep);
    return () => {
      window.removeEventListener('pagehide', keep);
      clearTimeout(timer.current);
      const end = setTimeout(() => {
        ending.delete(key);
        void held.session.endEdits();
        held.release();
      }, 0);
      ending.set(key, { timer: end, held });
    };
  }, [desktop, uid, sessionId]);

  const saveNow = useCallback(() => {
    clearTimeout(timer.current);
    return keepEdits();
  }, [keepEdits]);

  const update = useCallback(
    (change: (w: Working) => Working) => {
      if (!edit(change)) return;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void keepEdits(), HAND_EDIT_WRITE_MS);
    },
    [edit, keepEdits],
  );

  const { handEdits } = agent;
  return {
    status: 'ready',
    work,
    rev: session.base?.rev ?? 0,
    savedAt: new Date(handEdits?.savedAt ?? session.updatedAt),
    save: handEdits?.state ?? 'saved',
    update,
    saveNow,
    reload: nothing,
    backupAt: null,
    restoreBackup: nothing,
    discardBackup: nothing,
  };
}
