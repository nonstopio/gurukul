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

/** The poured wax: a smooth outline with soft lobes, drawn on a 200x200 box. */
const WAX_OUTLINE =
  'M 102.6 13.3 C 111.7 13.9 116 22.5 124.7 25.7 C 133.5 29 147.5 27.2 154.9 33 C 162.3 38.8 164.2 51.7 169.2 60.4 C 174.1 69 183.3 76.2 184.9 85.1 C 186.4 94 180.2 104 178.7 114 C 177.3 124 180.1 136.8 176.3 145 C 172.4 153.2 163.4 156.7 155.6 163.2 C 147.8 169.7 139.2 181.2 129.7 183.9 C 120.2 186.7 108.6 179.8 98.6 179.6 C 88.7 179.4 77.8 185.9 69.8 182.9 C 61.8 179.8 58.1 167.8 50.6 161.2 C 43.2 154.6 30 151.1 25.3 143.2 C 20.7 135.3 24.4 123.4 22.8 113.7 C 21.2 104 14.3 94.2 15.5 85 C 16.6 75.8 25 67.4 29.6 58.4 C 34.1 49.5 35.9 37.3 42.7 31.3 C 49.5 25.3 60.2 25.4 70.2 22.4 C 80.2 19.4 93.5 12.8 102.6 13.3 Z';

/** The circle the ring text runs on: radius 43 around the stamp's centre (100, 98). */
const RING_RADIUS = 43;
const RING_LENGTH = Math.round(2 * Math.PI * RING_RADIUS);

/** The pressed design, drawn three times: a light edge, a dark edge and the face. */
function Relief({
  ringId,
  ringText,
  centerText,
}: {
  ringId: string;
  ringText: string;
  centerText: string;
}) {
  return (
    <>
      <circle cx="100" cy="98" r="57" className="g-seal__relief-ring" />
      <circle cx="100" cy="98" r="34" className="g-seal__beads" />
      <text className="g-seal__ring-text">
        <textPath href={`#${ringId}`} textLength={RING_LENGTH} lengthAdjust="spacing">
          {ringText}
        </textPath>
      </text>
      <text className="g-seal__mark" x="100" y="99" textAnchor="middle" dominantBaseline="central">
        {centerText}
      </text>
    </>
  );
}

/**
 * The green wax seal: a poured blob with a raised rim around a pressed centre, the ring text and
 * the mark standing up in relief. Flat SVG shapes and gradients only (one blur, for the cast
 * shadow), so it stays crisp at any size and in print.
 */
export function Seal({
  label,
  ringText,
  centerText = 'G',
  size = 132,
  className,
  ...rest
}: SealProps) {
  const id = `g-seal-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const ringId = `${id}-ring`;
  const url = (part: string) => `url(#${id}-${part})`;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={cx('g-seal', className)}
      {...rest}
    >
      <defs>
        <radialGradient id={`${id}-body`} cx="34%" cy="28%" r="78%">
          <stop offset="0" className="g-seal__stop--light" />
          <stop offset="0.5" className="g-seal__stop--wax" />
          <stop offset="1" className="g-seal__stop--deep" />
        </radialGradient>
        <radialGradient id={`${id}-well`} cx="66%" cy="72%" r="85%">
          <stop offset="0" className="g-seal__stop--relief" />
          <stop offset="1" className="g-seal__stop--well" />
        </radialGradient>
        <linearGradient id={`${id}-bevel`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="g-seal__stop--shadow" />
          <stop offset="0.5" className="g-seal__stop--well" />
          <stop offset="1" className="g-seal__stop--shine" />
        </linearGradient>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="g-seal__stop--shine" />
          <stop offset="0.5" className="g-seal__stop--relief" />
          <stop offset="1" className="g-seal__stop--deep" />
        </linearGradient>
        <linearGradient id={`${id}-lip`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="g-seal__stop--shine g-seal__stop--soft" />
          <stop offset="0.45" className="g-seal__stop--shine g-seal__stop--clear" />
          <stop offset="1" className="g-seal__stop--shadow g-seal__stop--soft" />
        </linearGradient>
        <filter id={`${id}-blur`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
        <path
          id={ringId}
          fill="none"
          d={`M 100 98 m -${RING_RADIUS} 0 a ${RING_RADIUS} ${RING_RADIUS} 0 1 1 ${RING_RADIUS * 2} 0 a ${RING_RADIUS} ${RING_RADIUS} 0 1 1 -${RING_RADIUS * 2} 0`}
        />
      </defs>
      <path
        d={WAX_OUTLINE}
        className="g-seal__cast"
        transform="translate(3 5)"
        filter={url('blur')}
      />
      <path d={WAX_OUTLINE} className="g-seal__body" fill={url('body')} stroke={url('lip')} />
      <path d="M 22.7 77.3 A 80 80 0 0 1 54.1 32.5" className="g-seal__gloss g-seal__gloss--edge" />
      <circle cx="100" cy="98" r="66" className="g-seal__rim" stroke={url('rim')} />
      <circle
        cx="100"
        cy="98"
        r="61"
        className="g-seal__well"
        fill={url('well')}
        stroke={url('bevel')}
      />
      <path d="M 37 75.1 A 67 67 0 0 1 77.1 35" className="g-seal__gloss" />
      <g className="g-seal__layer g-seal__layer--light" transform="translate(-0.6 -0.8)">
        <Relief ringId={ringId} ringText={ringText} centerText={centerText} />
      </g>
      <g className="g-seal__layer g-seal__layer--dark" transform="translate(0.9 1.2)">
        <Relief ringId={ringId} ringText={ringText} centerText={centerText} />
      </g>
      <g className="g-seal__layer g-seal__layer--face">
        <Relief ringId={ringId} ringText={ringText} centerText={centerText} />
      </g>
    </svg>
  );
}
