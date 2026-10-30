import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import './page-header.css';

export interface PageHeaderProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** The page's only `h1`. */
  title: ReactNode;
  /** Area or context above the title, e.g. "Admin". */
  eyebrow?: ReactNode;
  /** One sentence under the title on what the page is for. */
  lead?: ReactNode;
  /** A `Breadcrumb`, above everything; only below a top-level page. */
  breadcrumb?: ReactNode;
  /** A row of chips or metadata under the title. */
  meta?: ReactNode;
  /** Buttons on the right; they wrap under the title on narrow screens. One primary at most. */
  actions?: ReactNode;
  /**
   * `h2` only where a page header is shown as an example inside another page (the Design
   * system tab), so that page keeps one `h1`. Default: `h1`.
   */
  titleAs?: 'h1' | 'h2';
}

/**
 * The top of every page. The `h1` is where focus lands after a navigation (the app's routeFocus
 * gives it `tabindex="-1"`).
 */
export function PageHeader({
  title,
  eyebrow,
  lead,
  breadcrumb,
  meta,
  actions,
  titleAs: Title = 'h1',
  className,
  ...rest
}: PageHeaderProps) {
  return (
    <header className={cx('g-page-header', className)} {...rest}>
      {breadcrumb}
      <div className="g-page-header__row">
        <div className="g-page-header__text">
          {eyebrow ? <p className="g-page-header__eyebrow">{eyebrow}</p> : null}
          <Title className="g-page-header__title">{title}</Title>
          {meta ? <div className="g-page-header__meta">{meta}</div> : null}
          {lead ? <p className="g-page-header__lead">{lead}</p> : null}
        </div>
        {actions ? <div className="g-page-header__actions">{actions}</div> : null}
      </div>
    </header>
  );
}
