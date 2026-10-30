import { Page } from './Page';
import type { PageWidth } from './Page';
import { Skeleton } from './Skeleton';
import './page-skeleton.css';

export interface PageSkeletonProps {
  /** The width of the page it stands in for. Default: `default`. */
  width?: PageWidth;
  /** Read by screen readers in place of the shapes. Default: "Loading". */
  label?: string;
}

/** A page's first load: a header-shaped skeleton and three cards, in a `Page`. */
export function PageSkeleton({ width = 'default', label = 'Loading' }: PageSkeletonProps) {
  return (
    <Page width={width} role="status" aria-busy="true">
      <span className="g-page-skeleton__label">{label}</span>
      <div className="g-page-skeleton__header">
        <Skeleton width="6rem" />
        <Skeleton width="40%" height="var(--text-3xl)" />
        <Skeleton width="60%" />
      </div>
      <Skeleton shape="block" height="8rem" />
      <Skeleton shape="block" height="8rem" />
      <Skeleton shape="block" height="8rem" />
    </Page>
  );
}
