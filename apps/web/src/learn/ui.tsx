import { Button, Callout, Page, PageSkeleton, Skeleton, buttonClass } from '@gurukul/ui';
import type { Course, ItemState } from '@gurukul/schema';
import { Link } from 'react-router';
import { blockerBefore, itemPath, openItemLabel } from '../quiz/model';
import type { PageWidth } from '@gurukul/ui';
import type { Loadable } from '../data/useAsync';
import { useTerms } from '../labels/useTerms';
import { ReportIssueLink } from '../ReportIssueLink';
import { codesOf } from '../report';

/** The shared loading, error and ready handling every data screen uses. */
export function Loaded<T>({
  loadable,
  skeleton,
  children,
}: {
  loadable: Loadable<T>;
  skeleton?: number;
  children: (value: T) => React.ReactNode;
}) {
  if (loadable.state === 'loading') {
    return (
      <div aria-busy="true" role="status">
        <span className="sr-only">Loading</span>
        {Array.from({ length: skeleton ?? 3 }, (_, i) => (
          <Skeleton key={i} shape="block" height={72} className="loading-row" />
        ))}
      </div>
    );
  }
  if (loadable.state === 'error') {
    // Plain words and Retry; raw error text is not for people (CLAUDE.md, API responses).
    const { retry, error } = loadable;
    return (
      <Callout tone="warning" title="This did not load" role="alert">
        <p>Check your connection and {retry ? 'try again' : 'reload the page'}.</p>
        <div className="load-actions">
          {retry && (
            <Button variant="secondary" onClick={retry}>
              Retry
            </Button>
          )}
          <ReportIssueLink problem={{ title: 'This did not load', code: codesOf(error) }} />
        </div>
      </Callout>
    );
  }
  return <>{children(loadable.value)}</>;
}

/**
 * `Loaded` for a whole page whose header needs the data (a course's title): a page-shaped skeleton
 * while it loads, the warning with Retry inside a `Page` if it fails, the page itself when ready.
 */
export function LoadedPage<T>({
  loadable,
  width = 'default',
  children,
}: {
  loadable: Loadable<T>;
  width?: PageWidth;
  children: (value: T) => React.ReactNode;
}) {
  if (loadable.state === 'loading') return <PageSkeleton width={width} />;
  if (loadable.state === 'ready') return <>{children(loadable.value)}</>;
  return (
    <Page width={width}>
      <Loaded loadable={loadable}>{children}</Loaded>
    </Page>
  );
}

/** What a lazily loaded page shows while its code downloads: the page's shape, not a word. */
export function PageLoading() {
  return <PageSkeleton />;
}

/** What a learner sees on a retired course: what they keep and why it cannot be finished now. */
export function RetiredNote() {
  const t = useTerms();
  return (
    <Callout tone="warning" title="This course is retired">
      <p>
        Your progress and any certificate are kept, and the lessons stay open to read. Its{' '}
        {t.Quizzes} are closed, so it can no longer be finished.
      </p>
    </Callout>
  );
}

/**
 * A locked lesson or Quiz: names the item in the way and opens it, so nobody has to hunt for it in
 * the outline. A locked item always has an unfinished one before it: an unpassed gating Quiz, or
 * an unfinished item in the chapter before.
 */
export function LockedNote({
  course,
  states,
  itemId,
}: {
  course: Course;
  states: Record<string, ItemState>;
  itemId: string;
}) {
  const t = useTerms();
  const blocker = blockerBefore(course, states, itemId) as NonNullable<
    ReturnType<typeof blockerBefore>
  >;
  return (
    <>
      <Callout tone="note" title="Locked for now">
        <p>
          {blocker.type === 'quiz'
            ? `Pass the ${t.Quiz} "${blocker.title}" first.`
            : `Finish "${blocker.title}" first.`}
        </p>
      </Callout>
      <div className="learn-buttons">
        <Link className={buttonClass('primary')} to={itemPath(course.id, blocker)}>
          {openItemLabel(blocker, t.Quiz)}
        </Link>
        <Link className={buttonClass('secondary')} to={`/courses/${course.id}`}>
          Back to the outline
        </Link>
      </div>
    </>
  );
}
