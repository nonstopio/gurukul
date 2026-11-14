import { Button, Page, PageHeader } from '@gurukul/ui';
import { useRouteError } from 'react-router';
import { useTrackOnMount } from './analytics/react/Track';
import { log } from './log';
import { ReportIssueLink } from './ReportIssueLink';
import { engineMessage } from './report';

/**
 * What a screen shows when rendering it crashes, in place of the router's default error page. The
 * error's name (`TypeError`) is counted in analytics; its message, which can hold anything, is not.
 */
export function RouteErrorPage() {
  const error = useRouteError();
  const code = error instanceof Error ? error.name : 'Unknown';
  useTrackOnMount('app_error', { source: 'route', code });
  log.error('A screen crashed', error);
  return (
    <main id="content">
      <Page width="reading">
        <PageHeader
          title="Something went wrong"
          mascot="error"
          lead="This page could not be shown. Reloading usually fixes it; if it keeps happening, report it and we will look into it."
          actions={
            <>
              <ReportIssueLink
                problem={{
                  title: 'A page crashed',
                  message: engineMessage(error),
                  code,
                }}
              />
              <Button onClick={() => window.location.reload()}>Reload</Button>
            </>
          }
        />
      </Page>
    </main>
  );
}
