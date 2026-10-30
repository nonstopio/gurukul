import { Button, Callout, Page, PageSkeleton, Skeleton } from '@gurukul/ui';
import type { PageWidth } from '@gurukul/ui';
import type { Loadable } from '../data/useAsync';
import { useTerms } from '../labels/useTerms';

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
    const { retry } = loadable;
    return (
      <Callout tone="warning" title="This did not load" role="alert">
        <p>Check your connection and {retry ? 'try again' : 'reload the page'}.</p>
        {retry && (
          <Button variant="secondary" className="load-retry" onClick={retry}>
            Retry
          </Button>
        )}
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

/** A course's cover as a small square (48px on lists) or a large panel (the continue card). */
export function CoverTile({
  cover,
  size,
}: {
  cover: { theme: 'forest' | 'sand' | 'sky' | 'stone'; glyph: string };
  size: 'small' | 'large';
}) {
  return (
    <span
      className={`cover-tile cover-tile--${size} cover-tile--${cover.theme}`}
      aria-hidden="true"
    >
      {cover.glyph}
    </span>
  );
}
