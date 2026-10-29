import { Button, Callout, Skeleton } from '@gurukul/ui';
import type { Loadable } from '../data/useAsync';

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
    const { error, retry } = loadable;
    return (
      <Callout tone="warning" title="This did not load" role="alert">
        <p>
          Check your connection and {retry ? 'try again' : 'reload the page'}. {error.message}
        </p>
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

/** What a lazily loaded page shows while its code downloads. */
export function PageLoading() {
  return (
    <main className="notfound" aria-busy="true">
      <p>Loading…</p>
    </main>
  );
}

/** What a learner sees on a retired course: what they keep and why it cannot be finished now. */
export function RetiredNote() {
  return (
    <Callout tone="warning" title="This course is retired">
      <p>
        Your progress and any certificate are kept, and the lessons stay open to read. Its Parikshas
        are closed, so it can no longer be finished.
      </p>
    </Callout>
  );
}
