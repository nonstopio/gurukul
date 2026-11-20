import {
  AlertIcon,
  Button,
  Card,
  ChatActivity,
  CheckIcon,
  ChevronLeftIcon,
  Dialog,
  EmptyState,
  Page,
  PageSkeleton,
  StateCard,
  TopBar,
  buttonClass,
  topBarBackClass,
} from '@gurukul/ui';
import { useMemo, useState } from 'react';
import { Link, useLocation, useMatch, useParams } from 'react-router';
import { useUser } from '../../auth/AuthProvider';
import { useDesktop } from '../../desktop/bridge';
import type { GurukulDesktop } from '../../desktop/bridge';
import { useTerms } from '../../labels/useTerms';
import { ChatPanel, reviewPath } from './ChatPanel';
import { PreviewPanel } from './PreviewPanel';
import { ReviewPanel } from './ReviewPanel';
import type { ChatState } from './ReviewPanel';
import { SourcesPanel } from './SourcesPanel';
import { UnavailableCard, UpdateTheAppButton } from './Problem';
import { useAgentSession } from './useAgentSession';
import type { AgentSessionHandle } from './useAgentSession';
import { useSideBySide } from './useSideBySide';
import { headerChecks, headerStatus } from './workspace';

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
 * `/studio/sessions/:sessionId` and its Review tab, `/studio/sessions/:sessionId/review`, inside the
 * desktop app (`.plan/22-desktop-studio.md`, The session workspace): the header with the change
 * count and checks, the chat beside the preview from 1024px (a drawer over it below), and Review
 * (`DSK-14`). Both share one runtime (`useAgentSession`), so leaving the chat for Review keeps the
 * agent going. Nothing here reads or writes Firestore.
 */
export function SessionPage() {
  const desktop = useDesktop();
  if (desktop.status === 'ready') {
    return <SessionView desktop={desktop.desktop} platform={desktop.info.platform} />;
  }
  if (desktop.status === 'checking') {
    return (
      <>
        <TopBar title="Session" back={<Back />} />
        <PageSkeleton width="wide" label="Opening the session" />
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
              <>
                <UpdateTheAppButton desktop={desktop.desktop} />
                <Link className={buttonClass('secondary')} to="/studio">
                  Back to the courses
                </Link>
              </>
            }
          >
            This version of the app cannot open sessions. Update the app, then restart it.
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

function SessionView({ desktop, platform }: { desktop: GurukulDesktop; platform: string }) {
  const { sessionId = '' } = useParams();
  const { uid } = useUser();
  const review = useMatch('/studio/sessions/:sessionId/review') !== null;
  const agent = useAgentSession({ desktop, uid, sessionId });
  const { session, status, problem } = agent;

  if (!session) {
    return (
      <>
        <TopBar title="Session" back={<Back />} />
        {status === 'missing' ? (
          <Page width="reading">
            <Missing />
          </Page>
        ) : status === 'unavailable' && problem ? (
          <Page width="reading">
            <UnavailableCard
              problem={problem}
              desktop={desktop}
              onRetry={() => void agent.retry()}
            />
          </Page>
        ) : (
          <PageSkeleton width="wide" label="Opening the session" />
        )}
      </>
    );
  }
  return (
    <Workspace
      agent={agent}
      desktop={desktop}
      platform={platform}
      uid={uid}
      sessionId={sessionId}
      review={review}
    />
  );
}

function Workspace({
  agent,
  desktop,
  platform,
  uid,
  sessionId,
  review,
}: {
  agent: AgentSessionHandle;
  desktop: GurukulDesktop;
  platform: string;
  uid: string;
  sessionId: string;
  review: boolean;
}) {
  const session = agent.session as NonNullable<AgentSessionHandle['session']>;
  const work = agent.work as NonNullable<AgentSessionHandle['work']>;
  // Worked out whenever there is a working copy.
  const changes = agent.changes as NonNullable<AgentSessionHandle['changes']>;
  const sideBySide = useSideBySide();
  // Review's Ask for a change comes back with the chat open (its drawer, below 1024px) and,
  // for "Ask the agent to fix these", a message ready in the box.
  const location = useLocation();
  const [chatOpen, setChatOpen] = useState(false);
  // The goal waits in the message box of a session nothing was said in yet: one press sends it.
  const [typed, setTyped] = useState<string | null>(null);
  // Once per arrival (the page stays mounted between the chat and Review, so not only at mount),
  // set while drawing, as React suggests for state that follows a changed input.
  const [arrived, setArrived] = useState<string | null>(null);
  if (arrived !== location.key) {
    setArrived(location.key);
    const asked = (location.state ?? null) as ChatState | null;
    if (asked?.chat === true) {
      setChatOpen(true);
      if (asked.draft !== undefined) setTyped(asked.draft);
    }
  }
  const goal = session.goals.map((g) => g.text).join('\n');
  const draft = typed ?? (agent.transcript.length === 0 ? goal : '');
  const checks = useMemo(() => headerChecks(work), [work]);
  const passing = checks.valid && !checks.overLimit;
  const working = agent.status === 'working' || agent.status === 'stopping';
  const open = session.status === 'open';
  const { attachments, attach, detach } = agent;
  // Attaching and the Sources folder belong to a session that can still change.
  const attaching = useMemo(
    () => (open ? { attachments, attach, detach } : null),
    [open, attachments, attach, detach],
  );
  const attached = attachments.length;

  const chat = (
    <ChatPanel
      agent={agent}
      desktop={desktop}
      sessionId={sessionId}
      draft={draft}
      onDraft={setTyped}
    />
  );

  return (
    <>
      <TopBar
        title={session.title}
        back={<Back />}
        status={
          <span className="ss-status">
            {passing ? <CheckIcon size={16} /> : <AlertIcon size={16} />}
            {headerStatus(changes.count, checks)}
          </span>
        }
        actions={
          review ? (
            <Link className={buttonClass('chrome-secondary')} to={`/studio/sessions/${sessionId}`}>
              Back to the chat
            </Link>
          ) : (
            <>
              {sideBySide ? null : (
                <Button variant="chrome-secondary" onClick={() => setChatOpen(true)}>
                  {attached === 0 ? 'Chat' : `Chat · ${attached} attached`}
                </Button>
              )}
              <Link className={buttonClass('chrome')} to={reviewPath(sessionId)}>
                Review
              </Link>
            </>
          )
        }
      />
      {review ? (
        <Page width="wide">
          <ReviewPanel agent={agent} desktop={desktop} uid={uid} sessionId={sessionId} />
        </Page>
      ) : (
        <Page width="wide">
          <div className="ss-workspace">
            {sideBySide ? (
              <Card title="Chat" className="ss-chat">
                {chat}
              </Card>
            ) : null}
            <Card className="ss-pane">
              {sideBySide ? null : (
                // With the chat in its drawer, the preview still says what the agent is doing.
                <ChatActivity className="ss-pane__activity">
                  {working && !chatOpen ? (agent.activity ?? 'Thinking') : null}
                </ChatActivity>
              )}
              <PreviewPanel
                work={work}
                base={agent.base}
                changes={changes}
                attaching={attaching}
                sources={
                  open ? (
                    <SourcesPanel
                      sources={desktop.sources}
                      uid={uid}
                      sessionId={sessionId}
                      platform={platform}
                      suggestedName={session.courseId ?? undefined}
                    />
                  ) : null
                }
              />
            </Card>
          </div>
        </Page>
      )}
      {!sideBySide && !review ? (
        <Dialog open={chatOpen} onClose={() => setChatOpen(false)} size="drawer" title="Chat">
          <div className="ss-drawer">{chat}</div>
        </Dialog>
      ) : null}
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
