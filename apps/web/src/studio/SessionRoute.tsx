import {
  ChevronLeftIcon,
  EmptyState,
  Page,
  PageSkeleton,
  TopBar,
  buttonClass,
  topBarBackClass,
} from '@gurukul/ui';
import { Suspense, lazy } from 'react';
import { Link } from 'react-router';
import { isDesktop } from '../desktop/bridge';
import { DESKTOP_RELEASES_PAGE } from '../desktop/download';
import { useTerms } from '../labels/useTerms';

// The session code is its own chunk, fetched only inside the desktop app: a browser never asks for it.
const SessionPage = lazy(async () => ({
  default: (await import('./session/SessionPage')).SessionPage,
}));

/**
 * `/studio/sessions/:sessionId`. Sessions live on the computer that runs the desktop app, so in a
 * browser this page only says so, with where to get the app; inside the app it loads the session.
 */
export function SessionRoute() {
  if (!isDesktop()) return <NeedsDesktopApp />;
  return (
    <Suspense fallback={<PageSkeleton width="default" label="Opening the session" />}>
      <SessionPage />
    </Suspense>
  );
}

// Own chunk too: the history table is only fetched inside the app.
const SessionHistoryPage = lazy(async () => ({
  default: (await import('./session/SessionHistoryPage')).SessionHistoryPage,
}));

/** `/studio/sessions`: the history of every session on this computer; a browser is told why not. */
export function SessionHistoryRoute() {
  if (!isDesktop()) return <NeedsDesktopApp title="Session history" />;
  return (
    <Suspense fallback={<PageSkeleton width="wide" label="Reading sessions" />}>
      <SessionHistoryPage />
    </Suspense>
  );
}

function NeedsDesktopApp({ title = 'Session' }: { title?: string }) {
  const t = useTerms();
  return (
    <>
      <TopBar
        title={title}
        back={
          <Link className={topBarBackClass} to="/studio">
            <ChevronLeftIcon size={16} />
            {`${t.Studio} courses`}
          </Link>
        }
      />
      <Page width="reading">
        <EmptyState
          title="Sessions open in the Gurukul Studio app"
          headingAs="h2"
          mascot="notFound"
          action={
            <a className={buttonClass('primary')} href={DESKTOP_RELEASES_PAGE}>
              Get the desktop app
            </a>
          }
        >
          {`A session builds a course by chatting with an AI, and it is kept on the computer it
          started on. Open this link in Gurukul Studio on that computer. Everything else in ${t.Studio}
          works here as it always has.`}
        </EmptyState>
      </Page>
    </>
  );
}
