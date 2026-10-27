import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import './stat-card.css';

export interface StatCardProps extends Omit<HTMLAttributes<HTMLDListElement>, 'children'> {
  /** What is measured, e.g. "Completion rate". Shown first, as the term. */
  label: ReactNode;
  /** The number or short value, shown large. */
  value: ReactNode;
  /** An optional line under the value, e.g. "42 of 120 learners". */
  sub?: ReactNode;
}

/** A single statistic: a small label, a big value and an optional sub line, as a one-entry `dl`. */
export function StatCard({ label, value, sub, className, ...rest }: StatCardProps) {
  return (
    <dl className={cx('g-stat', className)} {...rest}>
      <dt className="g-stat__label">{label}</dt>
      <dd className="g-stat__value">{value}</dd>
      {sub ? <dd className="g-stat__sub">{sub}</dd> : null}
    </dl>
  );
}
