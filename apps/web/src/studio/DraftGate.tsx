import {
  ChevronLeftIcon,
  EmptyState,
  Page,
  PageSkeleton,
  TopBar,
  buttonClass,
  topBarBackClass,
} from '@gurukul/ui';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Loaded } from '../learn/ui';
import { useTerms } from '../labels/useTerms';
import type { DraftApi } from './useDraft';
import type { Working } from './types';

/** The top bar's way back to the Studio course list. */
export function StudioBack() {
  return (
    <Link className={topBarBackClass} to="/studio">
      <ChevronLeftIcon size={16} />
      {useTerms().Studio}
    </Link>
  );
}

/**
 * Loading, load-failed and no-draft states shared by the editors, each under the top bar with
 * `title` as the page's `h1`; renders `children` once the draft is ready.
 */
export function DraftGate({
  draft,
  title,
  children,
}: {
  draft: Pick<DraftApi, 'status' | 'work'>;
  title: string;
  children: (work: Working) => ReactNode;
}) {
  const t = useTerms();
  if (draft.status === 'ready') return <>{children(draft.work as Working)}</>;
  const bar = <TopBar title={title} back={<StudioBack />} />;
  if (draft.status === 'loading') {
    return (
      <>
        {bar}
        <PageSkeleton width="wide" />
      </>
    );
  }
  return (
    <>
      {bar}
      <Page width="reading">
        {draft.status === 'missing' ? (
          <EmptyState
            headingAs="h2"
            title="This course has no draft you can edit"
            action={
              <Link className={buttonClass('secondary')} to="/studio">
                Back to your courses
              </Link>
            }
          >
            {`It may not exist, or you may not be one of its ${t.Educators}.`}
          </EmptyState>
        ) : (
          <Loaded loadable={{ state: 'error', error: new Error('The draft could not be loaded.') }}>
            {children}
          </Loaded>
        )}
      </Page>
    </>
  );
}
