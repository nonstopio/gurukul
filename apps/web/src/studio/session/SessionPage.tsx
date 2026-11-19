import {
  Callout,
  Card,
  ChevronLeftIcon,
  Chip,
  EmptyState,
  Page,
  PageSkeleton,
  StateCard,
  TopBar,
  buttonClass,
  topBarBackClass,
} from '@gurukul/ui';
import type { AuthoringSession } from '@gurukul/schema';
import { useCallback } from 'react';
import { Link, useParams } from 'react-router';
import { useUser } from '../../auth/AuthProvider';
import { useAsync } from '../../data/useAsync';
import { useDesktop } from '../../desktop/bridge';
import type { GurukulDesktop } from '../../desktop/bridge';
import { useTerms } from '../../labels/useTerms';
import { Loaded } from '../../learn/ui';
import { createSessionStore } from './store';

const STATUS = {
  open: { tone: 'accent', label: 'Open' },
  saved: { tone: 'neutral', label: 'Saved' },
  discarded: { tone: 'warning', label: 'Discarded' },
} as const;

function Back() {
  const t = useTerms();
  return (
    <Link className={topBarBackClass} to="/studio">
      <ChevronLeftIcon size={16} />
      {`${t.Studio} courses`}
    </Link>
  );
}

/**
 * `/studio/sessions/:sessionId` inside the desktop app: the session as it is kept on this computer.
 * For now its title, goal and kind, and the place the workspace (chat and live preview, `DSK-13`)
 * will fill. Reads local files only; nothing touches Firestore.
 */
export function SessionPage() {
  const desktop = useDesktop();
  if (desktop.status === 'ready') return <SessionLoader desktop={desktop.desktop} />;
  if (desktop.status === 'checking') {
    return (
      <>
        <TopBar title="Session" back={<Back />} />
        <PageSkeleton width="default" label="Opening the session" />
      </>
    );
  }
  return (
    <>
      <TopBar title="Session" back={<Back />} />
      <Page width="reading">
        {desktop.status === 'needs_update' ? (
          <StateCard
            variant="error"
            title="Update Gurukul Studio"
            actions={
              <Link className={buttonClass('secondary')} to="/studio">
                Back to the courses
              </Link>
            }
          >
            This version of the app cannot open sessions. Choose Check for updates in the app menu,
            then restart it.
          </StateCard>
        ) : (
          <StateCard
            variant="error"
            title="The app did not answer"
            actions={
              <Link className={buttonClass('secondary')} to="/studio">
                Back to the courses
              </Link>
            }
          >
            Close Gurukul Studio and open it again. The session is kept on this computer.
          </StateCard>
        )}
      </Page>
    </>
  );
}

function SessionLoader({ desktop }: { desktop: GurukulDesktop }) {
  const { sessionId = '' } = useParams();
  const { uid } = useUser();
  const loaded = useAsync(
    useCallback(
      () => createSessionStore({ desktop, uid }).read(sessionId),
      [desktop, uid, sessionId],
    ),
  );
  const session = loaded.state === 'ready' ? loaded.value : null;
  const status = session ? STATUS[session.status] : null;
  return (
    <>
      <TopBar
        title={session?.title ?? 'Session'}
        back={<Back />}
        status={status ? <Chip tone={status.tone}>{status.label}</Chip> : undefined}
      />
      {loaded.state === 'loading' ? (
        <PageSkeleton width="default" label="Opening the session" />
      ) : (
        <Page width="default">
          <Loaded loadable={loaded}>
            {(found) => (found ? <Workspace session={found} /> : <Missing />)}
          </Loaded>
        </Page>
      )}
    </>
  );
}

function Missing() {
  const t = useTerms();
  return (
    <EmptyState
      title="This session is not on this computer"
      headingAs="h2"
      mascot="notFound"
      action={
        <Link className={buttonClass('secondary')} to="/studio">
          {`Back to ${t.Studio}`}
        </Link>
      }
    >
      Sessions are kept on the computer they were started on, and removed 30 days after they are
      saved or discarded.
    </EmptyState>
  );
}

function Workspace({ session }: { session: AuthoringSession }) {
  const course = session.work.course;
  return (
    <>
      <Card title="Goal" className="sc-panel">
        <ul className="ss-goals">
          {session.goals.map((goal, i) => (
            <li key={i}>{goal.text}</li>
          ))}
        </ul>
        <p className="sc-help">
          {session.kind === 'new'
            ? 'A new course: its title and address are settled at the first save.'
            : `Changing the draft of “${course.title}”.`}
        </p>
      </Card>
      <Callout tone="note" title="The workspace opens here">
        <p>
          The chat and the live preview of this course come in the next update of Gurukul Studio.
          This session is kept on this computer until then, and nothing has been saved to the draft.
        </p>
      </Callout>
    </>
  );
}
