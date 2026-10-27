import { Callout, Skeleton } from '@gurukul/ui';
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
    return (
      <Callout tone="warning" title="This did not load" role="alert">
        <p>Check your connection and reload the page. {loadable.error.message}</p>
      </Callout>
    );
  }
  return <>{children(loadable.value)}</>;
}
