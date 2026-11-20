import type { Course } from '@gurukul/schema';
import type { CourseChanges } from '@gurukul/schema/changes';
import { Button, Callout, Card, buttonClass, useToast } from '@gurukul/ui';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useLearnerData } from '../../data/DataProvider';
import { useTerms } from '../../labels/useTerms';
import { toastError } from '../../errors';
import { log } from '../../log';
import { ConfirmDialog } from '../ConfirmDialog';
import { PublishDialog } from '../PublishDialog';
import { useStudio } from '../StudioProvider';
import type { Working } from '../types';
import { saveBlockers } from './review';
import { movedLine, saveSession, saveWaits } from './save';
import type { DraftCheck } from './save';
import type { DraftCheckApi } from './useDraftCheck';
import type { AgentSessionHandle } from './useAgentSession';

/*
 * Save to draft on the Review tab (`.plan/22-desktop-studio.md`, Save to draft): the one Firestore
 * write a session makes, through Studio's own save. The button says why it waits; its confirmation
 * names the draft it replaces; a draft saved meanwhile turns into Bring in their changes; a saved
 * session shows what was saved, with the course editor and Publish… beside it.
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
  const { data } = useStudio();
  const toast = useToast();
  const t = useTerms();
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const session = agent.session as NonNullable<AgentSessionHandle['session']>;
  // Worked out whenever there is a working copy, as on every session screen.
  const count = (agent.changes as CourseChanges).count;

  // A new course is created at its first save, with its title and slug (`DSK-16`).
  if (session.base === null) {
    return <p className="sc-help">Creating the course and saving its draft comes next.</p>;
  }
  const baseRev = session.base.rev;
  const courseId = session.courseId as string;
  const wait = saveWaits(
    agent,
    draft.check,
    saveBlockers({ valid, size: overLimit ? 'fail' : 'pass' }),
    count,
  );

  const save = async () => {
    setConfirming(false);
    setFailure(null);
    const outcome = await saveSession(agent, data, { uid, sessionId, courseId });
    switch (outcome.status) {
      case 'saved':
        toast.show(
          `Saved ${changesWord(count)} to Draft v${outcome.rev}. ${t.Learners} see nothing until you publish.`,
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
        setFailure(outcome.message);
    }
  };

  return (
    <div className="ss-save">
      <Button
        loading={agent.saving}
        disabled={wait !== null}
        aria-describedby={wait === null ? undefined : 'ss-save-wait'}
        onClick={() => setConfirming(true)}
      >
        {`Save ${changesWord(count)} to draft`}
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
      ) : null}
      {confirming ? (
        <ConfirmDialog
          title="Save to draft?"
          confirmLabel={`Save ${changesWord(count)} to draft`}
          tone="primary"
          onClose={() => setConfirming(false)}
          onConfirm={() => void save()}
        >
          {`This replaces Draft v${baseRev} with this session’s version. ${t.Learners} see nothing until you publish.`}
        </ConfirmDialog>
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
