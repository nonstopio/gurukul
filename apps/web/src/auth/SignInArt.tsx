import { Chip, ProgressBar, ProgressRing, Seal } from '@gurukul/ui';
import type { CSSProperties } from 'react';

/** Staggered entrance: step `n` waits n x 30ms (see `.rise` in learn.css). */
export const rise = (n: number) => ({ '--i': n }) as CSSProperties;

const DISCS = Array.from({ length: 16 * 14 }, (_, i) => ({
  x: 12 + (i % 16) * 24,
  y: 12 + Math.floor(i / 16) * 24,
}));

/**
 * Decorative only (hidden from assistive tech): a colour slab with a disc pattern, a mock course card
 * with progress, a progress ring and the certificate seal, all drawn from role tokens.
 */
export function SignInArt() {
  return (
    <div className="signin-art" aria-hidden="true">
      <svg className="signin-art__plate" viewBox="0 0 384 336" preserveAspectRatio="xMidYMid slice">
        <rect className="signin-art__slab" width="384" height="336" />
        {DISCS.map((d) => (
          <circle key={`${d.x}-${d.y}`} className="signin-art__disc" cx={d.x} cy={d.y} r="3" />
        ))}
        <circle className="signin-art__sun" cx="320" cy="64" r="44" />
      </svg>
      <div className="signin-art__card rise" style={rise(3)}>
        <p className="signin-art__kicker">Course</p>
        <p className="signin-art__title">Writing code others enjoy reading</p>
        <ProgressBar value={64} label="Course progress" />
        <div className="signin-art__row">
          <Chip tone="neutral">7 of 11 lessons</Chip>
          <Chip tone="accent">Quiz passed</Chip>
        </div>
      </div>
      <ProgressRing
        className="signin-art__ring rise"
        style={rise(4)}
        value={72}
        label="Week"
        size={72}
      />
      <Seal
        className="signin-art__seal rise"
        style={rise(5)}
        label="Certificate seal"
        ringText="NONSTOP GURUKUL · CERTIFIED · "
        size={104}
      />
      <span className="signin-art__pill rise" style={rise(6)}>
        Certificate earned
      </span>
    </div>
  );
}
