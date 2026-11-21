import { Button, Callout, Dialog, Skeleton, useToast } from '@gurukul/ui';
import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useAnalytics } from '../../analytics/react/context';
import { useUser } from '../../auth/AuthProvider';
import { useDesktop } from '../../desktop/bridge';
import type { DesktopState } from '../../desktop/bridge';
import { toastError } from '../../errors';
import { log } from '../../log';
import { useStudio } from '../StudioProvider';
import { createSessionStore, creatorName, sessionPath } from './store';
import type { SessionStore } from './store';

/** What the Studio course list asked to start: a new course, or an edit of one it lists. */
export type SessionStart =
  { kind: 'new' } | { kind: 'edit'; courseId: string; courseTitle: string };

/**
 * The desktop app's session buttons on the Studio course list, past the click, and on each visit
 * the 30-day clean-up of closed sessions. A click goes straight into the session workspace with no
 * dialog: the Educator says what they want in the session's own message box. Loaded only inside the
 * desktop app (`StudioCoursesPage` imports it lazily), so a browser never downloads it.
 */
export function SessionLauncher({
  start,
  onClose,
}: {
  start: SessionStart | null;
  onClose: () => void;
}) {
  const desktop = useDesktop();
  const { uid } = useUser();
  const store = useMemo(
    () =>
      desktop.status === 'ready' ? createSessionStore({ desktop: desktop.desktop, uid }) : null,
    [desktop, uid],
  );
  useEffect(() => {
    if (!store) return;
    store.sweep().catch((error: unknown) => log.error('Session clean-up failed', error));
  }, [store]);
  if (!start) return null;
  if (!store) {
    // Only here is a dialog needed: the app cannot start a session yet, and the Educator is told why.
    return (
      <Dialog
        open
        onClose={onClose}
        title="Start a session"
        footer={
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        }
      >
        <NotReady state={desktop as Exclude<DesktopState, { status: 'ready' }>} />
      </Dialog>
    );
  }
  return (
    <Starter
      key={start.kind === 'edit' ? start.courseId : 'new'}
      start={start}
      store={store}
      onClose={onClose}
    />
  );
}

/** The app is still answering, too old for sessions, or did not answer. */
function NotReady({ state }: { state: Exclude<DesktopState, { status: 'ready' }> }) {
  if (state.status === 'needs_update') {
    return (
      <Callout tone="warning" title="Update Gurukul Studio" role="alert">
        <p>
          This version of the app cannot start a session. Choose Check for updates in the app menu,
          restart it, then try again.
        </p>
      </Callout>
    );
  }
  if (state.status === 'failed') {
    return (
      <Callout tone="warning" title="The app did not answer" role="alert" mascot="error">
        <p>Close Gurukul Studio, open it again, then try again.</p>
      </Callout>
    );
  }
  return <Skeleton shape="block" height="8rem" aria-label="Checking the app" />;
}

/**
 * Starts the session once, then opens it. An edit of a course that already has an open session
 * opens that one (the store says `already_open`). A new course reuses an open new-course session
 * nothing has been done in yet (no turns), so clicking twice does not pile up empty sessions; one
 * with work in it is left in the course list's sessions and a fresh one starts.
 */
function Starter({
  start,
  store,
  onClose,
}: {
  start: SessionStart;
  store: SessionStore;
  onClose: () => void;
}) {
  const { data } = useStudio();
  const analytics = useAnalytics();
  const user = useUser();
  const toast = useToast();
  const navigate = useNavigate();
  // One start per click, also when React runs the effect twice in development.
  const began = useRef(false);

  useEffect(() => {
    if (began.current) return;
    began.current = true;
    const open = (id: string) => {
      onClose();
      void navigate(sessionPath(id));
    };
    const begin = async () => {
      if (start.kind === 'new') {
        const { sessions } = await store.list();
        const empty = sessions.find(
          (s) => s.status === 'open' && s.courseId === null && s.turns.length === 0,
        );
        if (empty) {
          open(empty.id);
          return;
        }
      }
      const result = await store.start(
        start.kind === 'edit'
          ? { kind: 'edit', courseId: start.courseId }
          : { kind: 'new', educatorName: creatorName(user) },
        (id) => data.getDraft(id),
      );
      if (result.status === 'no_draft') {
        onClose();
        toastError(
          toast,
          null,
          'This course has no draft you can open. Open it in the course editor first.',
        );
        return;
      }
      if (result.status === 'started') analytics.track('session_started', { kind: start.kind });
      open(result.session.id);
    };
    begin().catch((error: unknown) => {
      log.error('Session start failed', error, {
        courseId: start.kind === 'edit' ? start.courseId : null,
      });
      onClose();
      toastError(toast, error, 'The session did not start. Try again.');
    });
  }, [start, store, data, analytics, user, toast, navigate, onClose]);

  return (
    <div role="status" className="sr-only">
      Starting the session
    </div>
  );
}
