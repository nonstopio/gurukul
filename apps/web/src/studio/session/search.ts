import { connectDesktop } from '../../desktop/bridge';
import type { Terms } from '../../labels/terms';
import type { Destination } from '../../navigation/types';
import { createSessionStore, sessionPath } from './store';

const STATUS = { open: 'Open session', saved: 'Saved session', discarded: 'Discarded session' };

/**
 * Global search's sessions: each session this person has on this computer, newest first. Asked
 * only inside the desktop app (`sessionSource` is added to search there alone); reads local files,
 * never Firestore. A shell too old or not answering offers none.
 */
export async function sessionDestinations(uid: string, t: Terms): Promise<Destination[]> {
  const state = await connectDesktop();
  if (state.status !== 'ready') return [];
  const { sessions } = await createSessionStore({ desktop: state.desktop, uid }).list();
  return sessions.map((s) => {
    const course = s.kind === 'new' ? 'a new course' : s.work.course.title;
    return {
      id: `session:${s.id}`,
      path: sessionPath(s.id),
      label: s.title,
      areaName: t.Studio,
      description: `${STATUS[s.status]} · ${course}`,
      keywords: ['session', 'ai', 'chat', course],
      kind: 'Session',
    };
  });
}
