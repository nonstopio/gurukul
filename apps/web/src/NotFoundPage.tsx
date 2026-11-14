import { EmptyState, Page, PageHeader, buttonClass } from '@gurukul/ui';
import { Link } from 'react-router';

/** Any address the app does not know, inside the shell so the sidebar and search still work. */
export function NotFoundPage() {
  return (
    <Page width="reading">
      <PageHeader title="This page does not exist." />
      <EmptyState
        title="Nothing lives at this address"
        headingAs="h2"
        mascot="notFound"
        action={
          <Link className={buttonClass('secondary')} to="/">
            Go to Home
          </Link>
        }
      >
        Press <kbd>Ctrl</kbd> <kbd>K</kbd> (<kbd>⌘</kbd> <kbd>K</kbd> on a Mac) to search for a
        page, or start again from Home.
      </EmptyState>
    </Page>
  );
}
