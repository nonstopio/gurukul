import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import './progress.css';

/** Above this many steps a segment gets too thin to read, so the bar draws one continuous fill. */
export const MAX_PROGRESS_STEPS = 40;

export interface ProgressBarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Percent complete, 0 to 100. Out-of-range values are clamped. */
  value: number;
  /** Accessible name, e.g. "Course progress". */
  label: string;
  /** Print the percentage beside the bar. Default: true. */
  showValue?: boolean;
  /** Printed in place of the percentage, e.g. "44% · 10 / 22". */
  caption?: ReactNode;
  /**
   * One entry per step, in order, true when that step is done: the bar draws a segment for each
   * and prints "3 of 8 done". Above `MAX_PROGRESS_STEPS` it falls back to one continuous fill.
   */
  steps?: readonly boolean[];
  /** Index into `steps` of the step being viewed, marked with a ring. */
  current?: number;
  /** Spoken in place of the value, e.g. "4%, 1 of 26 lessons and Quizzes done". */
  valueText?: string;
}

/** Rounds to a whole percent inside 0 to 100. */
export function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** A determinate progress bar, continuous or one segment per step, with its count printed beside it. */
export function ProgressBar({
  value,
  label,
  showValue = true,
  caption,
  steps,
  current,
  valueText,
  className,
  ...rest
}: ProgressBarProps) {
  const pct = clampPercent(value);
  const count = steps ? `${steps.filter(Boolean).length} of ${steps.length} done` : undefined;
  const segmented = steps !== undefined && steps.length <= MAX_PROGRESS_STEPS;
  return (
    <div className={cx('g-progress', segmented && 'g-progress--steps', className)} {...rest}>
      <div
        className="g-progress__track"
        role="progressbar"
        aria-label={label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={valueText ?? count}
      >
        {segmented ? (
          steps.map((done, i) => (
            <span
              key={i}
              aria-hidden="true"
              className={cx(
                'g-progress__step',
                done && 'g-progress__step--done',
                i === current && 'g-progress__step--current',
              )}
            />
          ))
        ) : (
          <div className="g-progress__fill" style={{ width: `${pct}%` }} />
        )}
      </div>
      {showValue ? <span className="g-progress__text">{caption ?? count ?? `${pct}%`}</span> : null}
    </div>
  );
}
