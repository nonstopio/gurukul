import type { AuthoringSession } from '@gurukul/schema';
import {
  Button,
  ChevronLeftIcon,
  ClockIcon,
  EmptyState,
  Page,
  PageSkeleton,
  TopBar,
  buttonClass,
  topBarBackClass,
} from '@gurukul/ui';
import { Link } from 'react-router';
import type { GurukulDesktop } from '../../desktop/bridge';
import { LessonEditor } from '../LessonEditorPage';
import { QuizBuilder } from '../QuizBuilderPage';
import { sessionWorkspacePath } from '../editorPlace';
import type { Working } from '../types';
import type { AgentSessionHandle } from './useAgentSession';
import { useSessionDraft } from './useSessionDraft';

/*
 * `/studio/sessions/:sessionId/items/:itemId` (`.plan/22-desktop-studio.md`, The session workspace:
 * Edit by hand): Studio's own lesson editor or Quiz builder, picked by the item's type, over the
 * session's working copy through `useSessionDraft`. Hand edits happen only between turns: while the
 * agent works, the page says so and opens the editor by itself once the turn is written. Leaving
 * the editor makes the edits one turn by the Educator.
 */

interface Props {
  agent: AgentSessionHandle;
  desktop: GurukulDesktop;
  uid: string;
  sessionId: string;
  itemId: string;
}

export function HandEditor(props: Props) {
  const { agent, sessionId, itemId } = props;
  const work = agent.work as Working;
  const item = work.course.chapters.flatMap((c) => c.items).find((i) => i.id === itemId);
  const back = sessionWorkspacePath(sessionId, item ? `${item.type}:${item.id}` : undefined);
  if (!agent.canEdit) return <NotNow agent={agent} back={back} />;
  return <Editor {...props} quiz={item?.type === 'quiz'} />;
}

function Editor({ agent, desktop, uid, sessionId, itemId, quiz }: Props & { quiz: boolean }) {
  const session = agent.session as AuthoringSession;
  const work = agent.work as Working;
  const draft = useSessionDraft(agent, session, work, { desktop, uid, sessionId });
  const place = {
    kind: 'session' as const,
    sessionId,
    courseId: session.courseId,
    title: session.title,
  };
  return quiz ? (
    <QuizBuilder draft={draft} work={work} place={place} quizId={itemId} />
  ) : (
    <LessonEditor draft={draft} work={work} place={place} lessonId={itemId} />
  );
}

/** Why the editor is not open now: the session is closed, or a turn runs or is being undone. */
function NotNow({ agent, back }: { agent: AgentSessionHandle; back: string }) {
  const bar = (
    <TopBar
      title="Edit by hand"
      back={
        <Link className={topBarBackClass} to={back}>
          <ChevronLeftIcon size={16} />
          Session
        </Link>
      }
    />
  );
  const backLink = (
    <Link className={buttonClass('secondary')} to={back}>
      Back to the session
    </Link>
  );
  if (agent.status === 'closed') {
    return (
      <>
        {bar}
        <Page width="reading">
          <EmptyState title="This session is closed" headingAs="h2" action={backLink}>
            A saved or discarded session is kept to read, not to change.
          </EmptyState>
        </Page>
      </>
    );
  }
  if (agent.status !== 'working' && agent.status !== 'stopping') {
    // An undo, or hand edits from before the app closed, being written: a moment.
    return (
      <>
        {bar}
        <PageSkeleton width="wide" label="Opening the editor" />
      </>
    );
  }
  return (
    <>
      {bar}
      <Page width="reading">
        <EmptyState
          title="The agent is working on this course"
          headingAs="h2"
          icon={<ClockIcon size={24} />}
          action={
            <div className="ss-wait__actions">
              {backLink}
              <Button
                variant="secondary"
                disabled={!agent.canStop}
                onClick={() => void agent.stop()}
              >
                Stop the agent
              </Button>
            </div>
          }
        >
          Hand edits wait until its turn ends, so you and the agent never change the course at the
          same time. The editor opens here by itself once the turn is written.
        </EmptyState>
      </Page>
    </>
  );
}
