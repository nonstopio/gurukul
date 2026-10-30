import { EmptyState, LockIcon, Page, PageHeader, buttonClass } from '@gurukul/ui';
import { Link } from 'react-router';
import { article } from '../labels/terms';
import { useTerms } from '../labels/useTerms';

/** A page this person's roles do not open. The rules refuse the data anyway; this says so. */
export function NotAllowedPage() {
  const t = useTerms();
  return (
    <Page width="reading">
      <PageHeader title="You do not have access to this page." />
      <EmptyState
        title="This needs another role"
        headingAs="h2"
        icon={<LockIcon size={24} />}
        action={
          <Link className={buttonClass('secondary')} to="/">
            Go to Home
          </Link>
        }
      >
        {`Ask ${article(t.Admin)} if you need it.`}
      </EmptyState>
    </Page>
  );
}
