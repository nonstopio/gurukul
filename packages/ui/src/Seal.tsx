import { useId, type SVGAttributes } from 'react';
import { cx } from './cx';
import './seal.css';

export interface SealProps extends Omit<SVGAttributes<SVGSVGElement>, 'children'> {
  /** The accessible name, e.g. "Seal of NonStop Gurukul". Required: the seal is `role="img"`. */
  label: string;
  /** Text set around the circle, e.g. "NONSTOP GURUKUL · CERTIFIED · ". */
  ringText: string;
  /** The mark in the middle. Default: `G`. */
  centerText?: string;
  /** Rendered size in px. Default: 132. */
  size?: number;
}

const RING_RADIUS = 47;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** The forest and gold seal: two gold rings, text on a circle path, a mark in the middle. */
export function Seal({
  label,
  ringText,
  centerText = 'G',
  size = 132,
  className,
  ...rest
}: SealProps) {
  const pathId = `g-seal-${useId()}`;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 132 132"
      width={size}
      height={size}
      className={cx('g-seal', className)}
      {...rest}
    >
      <circle className="g-seal__disc" cx="66" cy="66" r="64" />
      <circle className="g-seal__ring" cx="66" cy="66" r="60" />
      <circle className="g-seal__ring g-seal__ring--inner" cx="66" cy="66" r="35" />
      <path
        id={pathId}
        fill="none"
        d={`M 66 66 m -${RING_RADIUS} 0 a ${RING_RADIUS} ${RING_RADIUS} 0 1 1 ${RING_RADIUS * 2} 0 a ${RING_RADIUS} ${RING_RADIUS} 0 1 1 -${RING_RADIUS * 2} 0`}
      />
      <text className="g-seal__ring-text">
        <textPath href={`#${pathId}`} textLength={RING_LENGTH} lengthAdjust="spacing">
          {ringText}
        </textPath>
      </text>
      <text className="g-seal__mark" x="66" y="66" textAnchor="middle" dominantBaseline="central">
        {centerText}
      </text>
    </svg>
  );
}
