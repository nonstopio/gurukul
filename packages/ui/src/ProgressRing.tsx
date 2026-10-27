import type { HTMLAttributes } from 'react';
import { clampPercent } from './ProgressBar';
import { cx } from './cx';
import './progress.css';

export interface ProgressRingProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Percent complete, 0 to 100. Out-of-range values are clamped. */
  value: number;
  /** Accessible name, e.g. "Course progress". */
  label: string;
  /** Diameter in px. Default: 56. */
  size?: number;
  /** Ring thickness in px. Default: 6. */
  stroke?: number;
}

/** A circular progress indicator with the percentage printed in the middle. */
export function ProgressRing({
  value,
  label,
  size = 56,
  stroke = 6,
  className,
  ...rest
}: ProgressRingProps) {
  const pct = clampPercent(value);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div
      className={cx('g-ring', className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      {...rest}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          className="g-ring__track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
        />
        <circle
          className="g-ring__fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="g-ring__text" aria-hidden="true">
        {pct}%
      </span>
    </div>
  );
}
