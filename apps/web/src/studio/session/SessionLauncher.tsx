import { Button, Callout, Dialog, Skeleton, Textarea, buttonClass } from '@gurukul/ui';
import type { AuthoringSession } from '@gurukul/schema';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useUser } from '../../auth/AuthProvider';
import { useDesktop } from '../../desktop/bridge';
import type { DesktopState, GurukulDesktop } from '../../desktop/bridge';
import { useTerms } from '../../labels/useTerms';
import { log } from '../../log';
import { useStudio } from '../StudioProvider';
import { SourcesOffer } from './SourcesOffer';
import { GOAL_MAX_LENGTH, createSessionStore, creatorName, sessionPath } from './store';
import type { SessionStore } from './store';

/** What the Studio course list asked to start: a new course, or an edit of one it lists. */
export type SessionStart =
  { kind: 'new' } | { kind: 'edit'; courseId: string; courseTitle: string };

const titleOf = (start: SessionStart) =>
  start.kind === 'new' ? 'New course with AI' : `Edit “${start.courseTitle}” with AI`;

/**
 * The desktop app's session buttons on the Studio course list, past the click: the start dialog,
 * and on each visit the 30-day clean-up of closed sessions. Loaded only inside the desktop app
 * (`StudioCoursesPage` imports it lazily), so a browser never downloads it.
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
    return (
      <Dialog
        open
        onClose={onClose}
        title={titleOf(start)}
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
  const ready = desktop as Extract<DesktopState, { status: 'ready' }>;
  return (
    <StartForm
      key={start.kind === 'edit' ? start.courseId : 'new'}
      start={start}
      store={store}
      sources={ready.desktop.sources}
      platform={ready.info.platform}
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

type Look =
  | { state: 'checking' }
  | { state: 'form'; resumable: AuthoringSession[] }
  | { state: 'open'; session: AuthoringSession }
  | { state: 'failed' };

const FORM_ID = 'session-start-form';

function StartForm({
  start,
  store,
  sources,
  platform,
  onClose,
}: {
  start: SessionStart;
  store: SessionStore;
  sources: GurukulDesktop['sources'];
  platform: string;
  onClose: () => void;
}) {
  const { data } = useStudio();
  const user = useUser();
  const t = useTerms();
  const navigate = useNavigate();
  const [look, setLook] = useState<Look>({ state: 'checking' });
  const [goal, setGoal] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const courseId = start.kind === 'edit' ? start.courseId : null;
  // Made now, not at start: the Sources folder is chosen for this session before it exists.
  const [sessionId] = useState(() => crypto.randomUUID());

  // Local files only: whether a session is already open, before anything is read from Firestore.
  const check = useCallback(async (): Promise<Look> => {
    const { sessions } = await store.list();
    const open = sessions.filter((s) => s.status === 'open');
    if (courseId === null) {
      return { state: 'form', resumable: open.filter((s) => s.courseId === null) };
    }
    const same = open.find((s) => s.courseId === courseId);
    return same ? { state: 'open', session: same } : { state: 'form', resumable: [] };
  }, [store, courseId]);

  useEffect(() => {
    let live = true;
    void check()
      .catch((error: unknown): Look => {
        log.error('Session list failed', error);
        return { state: 'failed' };
      })
      .then((next) => {
        if (live) setLook(next);
      });
    return () => {
      live = false;
    };
  }, [check]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (goal.trim() === '' || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const result = await store.start(
        start.kind === 'edit'
          ? { kind: 'edit', courseId: start.courseId, goal, id: sessionId }
          : { kind: 'new', goal, educatorName: creatorName(user), id: sessionId },
        (id) => data.getDraft(id),
      );
      if (result.status === 'started') {
        onClose();
        void navigate(sessionPath(result.session.id));
        return;
      }
      if (result.status === 'already_open') setLook({ state: 'open', session: result.session });
      else setProblem('This course has no draft you can open. Open it in the course editor first.');
    } catch (error) {
      log.error('Session start failed', error, { courseId });
      setProblem('The session did not start. Try again.');
    }
    setBusy(false);
  };

  const cancel = (
    <Button variant="secondary" onClick={onClose}>
      Cancel
    </Button>
  );
  const footer =
    look.state === 'form' ? (
      <>
        {cancel}
        <Button type="submit" form={FORM_ID} disabled={goal.trim() === ''} loading={busy}>
          Start session
        </Button>
      </>
    ) : look.state === 'open' ? (
      <>
        {cancel}
        <Link
          className={buttonClass('primary')}
          to={sessionPath(look.session.id)}
          onClick={onClose}
        >
          Open the session
        </Link>
      </>
    ) : (
      cancel
    );

  return (
    <Dialog open onClose={onClose} title={titleOf(start)} footer={footer}>
      {look.state === 'checking' ? (
        <Skeleton shape="block" height="8rem" aria-label="Looking for open sessions" />
      ) : look.state === 'failed' ? (
        <Callout tone="warning" title="Your sessions could not be read" role="alert" mascot="error">
          <p>Close this and try again. If it keeps happening, restart Gurukul Studio.</p>
        </Callout>
      ) : look.state === 'open' ? (
        <Callout tone="note" title="You already have a session on this course">
          <p>
            {`“${look.session.title}” is still open, and a course has one session at a time. Open
            it to keep working.`}
          </p>
        </Callout>
      ) : (
        <form id={FORM_ID} className="sc-form" onSubmit={(e) => void submit(e)}>
          {look.resumable.length > 0 ? (
            <nav aria-label="Open sessions" className="ss-resume">
              <p>Continue a new course you started:</p>
              <ul>
                {look.resumable.map((s) => (
                  <li key={s.id}>
                    <Link to={sessionPath(s.id)} onClick={onClose}>
                      {s.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
          {problem ? (
            <Callout tone="warning" title="The session did not start" role="alert" mascot="error">
              <p>{problem}</p>
            </Callout>
          ) : null}
          <Textarea
            label="What do you want to do?"
            hint={
              start.kind === 'edit'
                ? `One or two sentences, for example: “The rebase ${t.chapter} is too heavy. Simplify it and add a ${t.Quiz}.”`
                : `One or two sentences, for example: “A short course on writing good pull requests, with a ${t.Quiz} at the end.”`
            }
            value={goal}
            rows={4}
            maxLength={GOAL_MAX_LENGTH}
            required
            onChange={(e) => setGoal(e.target.value)}
          />
          <SourcesOffer
            sources={sources}
            session={{ uid: user.uid, sessionId }}
            platform={platform}
            suggestedName={courseId ?? undefined}
          />
          <p className="sc-help">
            This runs Claude Code on this computer, under your own Claude account. The course and
            what you write are sent to Anthropic, so leave out client names and internal documents.
            The draft does not change until you review the session and save it.
          </p>
        </form>
      )}
    </Dialog>
  );
}
