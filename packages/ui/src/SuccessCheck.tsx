import type { SVGAttributes } from 'react';
import { cx } from './cx';
import './success-check.css';

export interface SuccessCheckProps extends Omit<SVGAttributes<SVGSVGElement>, 'children'> {
  /** Width and height in px. Default: 56. */
  size?: number;
}

/** A ring and a tick that draw themselves once, for the moment a task is done. Decorative. */
export function SuccessCheck({ size = 56, className, ...rest }: SuccessCheckProps) {
  return (
    <svg
      className={cx('g-success-check', className)}
      width={size}
      height={size}
      viewBox="0 0 56 56"
      fill="none"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <circle className="g-success-check__ring" cx="28" cy="28" r="26" pathLength="1" />
      <path className="g-success-check__tick" d="M16 29l8 8 16-17" pathLength="1" />
    </svg>
  );
}
