import type { HTMLAttributes } from 'react';
import { cx } from './cx';
import './insert-divider.css';

export type InsertDividerProps = HTMLAttributes<HTMLDivElement>;

/**
 * A quiet "add here" between two things in a list: the control it holds (a `Menu` or an
 * `IconButton` with a plus) sits centred, and a hairline runs either side of it while the pointer
 * is over it or focus is in it. The control carries the accessible name; the lines are drawn.
 */
export function InsertDivider({ className, ...rest }: InsertDividerProps) {
  return <div className={cx('g-insert-divider', className)} {...rest} />;
}
