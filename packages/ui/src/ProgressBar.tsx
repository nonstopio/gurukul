import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import './progress.css';

export interface ProgressBarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Percent complete, 0 to 100. Out-of-range values are clamped. */
  value: number;
  /** Accessible name, e.g. "Course progress". */
  label: string;
  /** Print the percentage beside the bar. Default: true. */
  showValue?: boolean;
  /** Printed in place of the percentage, e.g. "44% · 10 / 22". */
  caption?: ReactNode;
}

/** Rounds to a whole percent inside 0 to 100. */
export function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** A thin determinate progress bar with its percentage printed beside it. */
export function ProgressBar({
  value,
  label,
  showValue = true,
  caption,
  className,
  ...rest
}: ProgressBarProps) {
  const pct = clampPercent(value);
  return (
    <div className={cx('g-progress', className)} {...rest}>
      <div
        className="g-progress__track"
        role="progressbar"
        aria-label={label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="g-progress__fill" style={{ width: `${pct}%` }} />
      </div>
      {showValue ? <span className="g-progress__text">{caption ?? `${pct}%`}</span> : null}
    </div>
  );
}
