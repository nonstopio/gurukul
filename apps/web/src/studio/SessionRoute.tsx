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
import { useTerms } from '../labels/useTerms';

/** Where the desktop app's installers are published (`.plan/22-desktop-studio.md`, Download). */
export const DESKTOP_RELEASES_URL = 'https://github.com/nonstopio/gurukul/releases/latest';

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

function NeedsDesktopApp() {
  const t = useTerms();
  return (
    <>
      <TopBar
        title="Session"
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
            <a className={buttonClass('primary')} href={DESKTOP_RELEASES_URL}>
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
