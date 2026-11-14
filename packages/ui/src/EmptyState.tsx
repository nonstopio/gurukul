import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import { Mascot } from './Mascot';
import type { MascotState } from './Mascot';
import './empty-state.css';

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** What is missing, in plain words. */
  title: string;
  /** Heading level to fit the page outline. Default: `h3`. */
  headingAs?: 'h2' | 'h3' | 'h4';
  /** Decorative icon, hidden from assistive tech, in place of the owl (a lock for "not for you"). */
  icon?: ReactNode;
  /** The owl's state when there is no `icon`: usually `empty` (curious) or `notFound`. Default: `empty`. */
  mascot?: MascotState;
  /** The next step, usually a `Button`. */
  action?: ReactNode;
  /** One line on why it is empty and what to do. */
  children?: ReactNode;
}

/** The "nothing here yet" panel, with the curious owl unless an `icon` says more. Say what is missing and what to do; never invent numbers. */
export function EmptyState({
  title,
  headingAs: Heading = 'h3',
  icon,
  mascot = 'empty',
  action,
  className,
  children,
  ...rest
}: EmptyStateProps) {
  return (
    <div className={cx('g-empty', className)} {...rest}>
      <div className="g-empty__icon" aria-hidden="true">
        {icon ?? <Mascot state={mascot} size={64} />}
      </div>
      <Heading className="g-empty__title">{title}</Heading>
      {children ? <p className="g-empty__text">{children}</p> : null}
      {action ? <div className="g-empty__action">{action}</div> : null}
    </div>
  );
}
