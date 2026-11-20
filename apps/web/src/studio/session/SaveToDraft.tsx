import type { Course } from '@gurukul/schema';
import type { CourseChanges } from '@gurukul/schema/changes';
import { Button, Callout, Card, Dialog, buttonClass, useToast } from '@gurukul/ui';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAnalytics } from '../../analytics/react/context';
import { userMessageOf } from '../../api';
import { useLearnerData } from '../../data/DataProvider';
import { useTerms } from '../../labels/useTerms';
import { toastError } from '../../errors';
import { log } from '../../log';
import { ConfirmDialog } from '../ConfirmDialog';
import { CourseAddressFields, isAddressTaken, useCourseAddress } from '../CourseAddress';
import { PublishDialog } from '../PublishDialog';
import { useStudio } from '../StudioProvider';
import type { Working } from '../types';
import type { SessionBase } from './agent';
import { saveBlockers } from './review';
import { movedLine, saveSession, saveWaits } from './save';
import type { DraftCheck } from './save';
import { NEW_COURSE_TITLE, createdBase } from './store';
import type { DraftCheckApi } from './useDraftCheck';
import type { AgentSessionHandle } from './useAgentSession';

/*
 * Save to draft on the Review tab (`.plan/22-desktop-studio.md`, Save to draft): the one Firestore
 * write a session makes, through Studio's own save. The button says why it waits; its confirmation
 * names the draft it replaces; a draft saved meanwhile turns into Bring in their changes; a saved
 * session shows what was saved, with the course editor and Publish… beside it. A new course
 * (`DSK-16`) asks for its title and address instead, creates the course through `createCourse`,
 * makes the session an edit session on it, and only then saves the draft: a save that fails is
 * offered again as an edit session's, so the course is never created twice.
 */

const changesWord = (n: number) => `${n} ${n === 1 ? 'change' : 'changes'}`;
const courseEditorPath = (courseId: string) => `/studio/courses/${courseId}`;

/** At the top of Review when the draft moved: who saved it, and Bring in their changes. */
export function DraftMovedNotice({
  check,
  uid,
  canSave,
  onBringIn,
}: {
  check: Extract<DraftCheck, { state: 'moved' }>;
  uid: string;
  canSave: boolean;
  onBringIn: () => void;
}) {
  return (
    <Callout tone="warning" title={movedLine(check.stored, uid, new Date())}>
      <p>
        Bring their changes in before you save: you choose, for each thing both of you changed,
        which version to keep. Nothing is overwritten without it.
      </p>
      <div className="ss-save__actions">
        <Button variant="secondary" disabled={!canSave} onClick={onBringIn}>
          Bring in their changes
        </Button>
        {canSave ? null : <p className="sc-help">Wait for the agent to finish this turn.</p>}
      </div>
    </Callout>
  );
}

/** What creating the course came to, for the dialog: created, the address taken, or why not. */
type Created = 'created' | 'taken' | { problem: string };

const CREATE_FORM = 'ss-create-course';

/** A new course's first save: its title and address (`DSK-16`), then Create course and save draft. */
function CreateCourseDialog({
  initialTitle,
  count,
  onClose,
  onCreate,
}: {
  initialTitle: string;
  count: number;
  onClose: () => void;
  onCreate: (title: string, slug: string) => Promise<Created>;
}) {
  const t = useTerms();
  const address = useCourseAddress(initialTitle);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!address.valid || busy) return;
    setBusy(true);
    setProblem(null);
    const result = await onCreate(address.title.trim(), address.slug);
    // Created: the page has closed the dialog and goes on to save the draft.
    if (result === 'created') return;
    if (result === 'taken') address.markTaken();
    else setProblem(result.problem);
    setBusy(false);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Create the course"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={CREATE_FORM} disabled={!address.valid} loading={busy}>
            Create course and save draft
          </Button>
        </>
      }
    >
      <form id={CREATE_FORM} className="sc-form" onSubmit={(e) => void submit(e)}>
        {problem ? (
          <Callout tone="warning" title="The course was not created" role="alert" mascot="error">
            <p>{problem}</p>
          </Callout>
        ) : null}
        <p>
          {`Gurukul creates the course with this title and address, then saves this session’s ${changesWord(count)} to its draft. ${t.Learners} see nothing until you publish.`}
        </p>
        <CourseAddressFields address={address} />
      </form>
    </Dialog>
  );
}

/** The footer's Save to draft: the button, why it waits, its confirmation and what went wrong. */
export function SaveBar({
  agent,
  draft,
  uid,
  sessionId,
  valid,
  overLimit,
}: {
  agent: AgentSessionHandle;
  draft: DraftCheckApi;
  uid: string;
  sessionId: string;
  valid: boolean;
  overLimit: boolean;
}) {
  const { data, service } = useStudio();
  const analytics = useAnalytics();
  const toast = useToast();
  const t = useTerms();
  const [confirming, setConfirming] = useState(false);
  const [creating, setCreating] = useState(false);
  /**
   * The draft of a course created for this session that the session could not note yet: Save then
   * notes it again, and never creates the course a second time. Held by the runtime (and in
   * `created.json`), so it outlives this footer: leaving Review and coming back keeps it.
   */
  const created = agent.pendingCourse;
  const [failure, setFailure] = useState<string | null>(null);
  const session = agent.session as NonNullable<AgentSessionHandle['session']>;
  const work = agent.work as Working;
  // Worked out whenever there is a working copy, as on every session screen.
  const count = (agent.changes as CourseChanges).count;
  const wait = saveWaits(
    agent,
    draft.check,
    saveBlockers({ valid, size: overLimit ? 'fail' : 'pass' }),
    count,
  );

  /** The draft saved through Studio's own save; `title` names a course just created. */
  const save = async (courseId: string, title?: string) => {
    setConfirming(false);
    setFailure(null);
    const outcome = await saveSession(agent, data, { uid, sessionId, courseId });
    switch (outcome.status) {
      case 'saved':
        toast.show(
          title === undefined
            ? `Saved ${changesWord(count)} to Draft v${outcome.rev}. ${t.Learners} see nothing until you publish.`
            : `Created “${title}” and saved its draft as Draft v${outcome.rev}. ${t.Learners} see nothing until you publish.`,
          { tone: 'success' },
        );
        if (!outcome.kept)
          toast.show(
            'This computer could not mark the session as saved. The draft has every change; if the session opens again, bring the draft in and leave it.',
            { tone: 'warning' },
          );
        return;
      case 'moved':
        draft.found(outcome.stored);
        if (outcome.stored === null)
          setFailure(
            'The draft was saved again meanwhile, and it could not be read. Check the draft again, then bring in their changes.',
          );
        return;
      case 'refused':
        setFailure('Save could not start just now. Wait for the agent to finish, then try again.');
        return;
      case 'failed':
        setFailure(
          title === undefined
            ? outcome.message
            : `The course “${title}” was created, but its draft was not saved. ${outcome.message}`,
        );
    }
  };

  /**
   * The course exists: the session becomes an edit session on it, then the draft is saved. When it
   * could not be noted, the runtime keeps it as `pendingCourse`, which the footer says.
   */
  const note = async (base: SessionBase) => {
    setFailure(null);
    if (await agent.courseCreated(base)) await save(base.work.course.id, base.work.course.title);
  };

  const create = async (title: string, slug: string): Promise<Created> => {
    setFailure(null);
    try {
      const { courseId } = await service.createCourse({
        title,
        slug,
        level: work.course.level,
        theme: work.course.cover.theme,
        duplicateFrom: null,
      });
      analytics.track('course_create', { course_id: courseId });
      setCreating(false);
      await note(createdBase(work, { courseId, title, uid, at: new Date().toISOString() }));
      return 'created';
    } catch (error) {
      if (isAddressTaken(error)) return 'taken';
      log.error('Creating a course failed', error, { sessionId });
      return { problem: userMessageOf(error, 'Could not create the course. Try again.') };
    }
  };

  // A new course is created at its first save (`DSK-16`); once created it has a base.
  const fresh = session.base === null;
  const label = !fresh
    ? `Save ${changesWord(count)} to draft`
    : created
      ? 'Save the draft'
      : 'Create course and save draft';

  return (
    <div className="ss-save">
      <Button
        loading={agent.saving}
        disabled={wait !== null}
        aria-describedby={wait === null ? undefined : 'ss-save-wait'}
        onClick={() =>
          !fresh ? setConfirming(true) : created ? void note(created) : setCreating(true)
        }
      >
        {label}
      </Button>
      {wait === null ? null : (
        <p id="ss-save-wait" className="sc-help">
          {wait}
        </p>
      )}
      {failure ? (
        <Callout tone="warning" title="Not saved">
          <p>{failure}</p>
        </Callout>
      ) : created ? (
        <Callout tone="warning" title="Not saved">
          <p>
            {`The course “${created.work.course.title}” was created, but this computer could not note it, so its draft was not saved. Save the draft again: the course is not created twice.`}
          </p>
        </Callout>
      ) : null}
      {confirming && session.base ? (
        <ConfirmDialog
          title="Save to draft?"
          confirmLabel={`Save ${changesWord(count)} to draft`}
          tone="primary"
          onClose={() => setConfirming(false)}
          onConfirm={() => void save(session.courseId as string)}
        >
          {`This replaces Draft v${session.base.rev} with this session’s version. ${t.Learners} see nothing until you publish.`}
        </ConfirmDialog>
      ) : null}
      {creating ? (
        <CreateCourseDialog
          initialTitle={work.course.title === NEW_COURSE_TITLE ? '' : work.course.title}
          count={count}
          onClose={() => setCreating(false)}
          onCreate={create}
        />
      ) : null}
    </div>
  );
}

/** A saved session: what was saved, Open the course editor, and Publish… (Studio's own dialog). */
export function SavedCard({ agent }: { agent: AgentSessionHandle }) {
  const learner = useLearnerData();
  const toast = useToast();
  const t = useTerms();
  const navigate = useNavigate();
  const session = agent.session as NonNullable<AgentSessionHandle['session']>;
  // Only an edit session is saved here, so it has a course and the base it was compared with.
  const courseId = session.courseId as string;
  const base = session.base as NonNullable<typeof session.base>;
  const [opening, setOpening] = useState(false);
  const [live, setLive] = useState<{ course: Course | null } | null>(null);

  const publish = async () => {
    setOpening(true);
    try {
      setLive({ course: await learner.getCourse(courseId, { fresh: true }) });
    } catch (error) {
      log.warn('Course not read for publishing', { courseId });
      toastError(toast, error, 'The course could not be read. Try again.');
    } finally {
      setOpening(false);
    }
  };

  return (
    <Card title="Saved to the draft">
      <div className="ss-save__saved">
        <p>
          {`${changesWord((agent.changes as CourseChanges).count)} saved to Draft v${base.rev + 1}. ${t.Learners} see nothing until you publish. The changes are listed below as they were saved.`}
        </p>
        <div className="ss-save__actions">
          <Link className={buttonClass('secondary')} to={courseEditorPath(courseId)}>
            Open the course editor
          </Link>
          <Button loading={opening} onClick={() => void publish()}>
            Publish…
          </Button>
        </div>
      </div>
      {live ? (
        <PublishDialog
          work={agent.work as Working}
          live={live.course && live.course.version > 0 ? live.course : null}
          onClose={() => setLive(null)}
          onPublished={() => undefined}
          onOpenLanding={() => void navigate(`${courseEditorPath(courseId)}?tab=landing`)}
          onOpenAccess={() => void navigate(courseEditorPath(courseId))}
        />
      ) : null}
    </Card>
  );
}
