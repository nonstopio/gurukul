import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import { Mascot } from './Mascot';
import type { MascotState } from './Mascot';
import './explanation.css';

export type ExplanationVerdict = 'correct' | 'incorrect' | 'neutral';

export interface ExplanationProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** The answer it explains: `correct` (success ground), `incorrect` (warning ground), `neutral` (no verdict). */
  verdict?: ExplanationVerdict;
  /** The lead-in, carrying the verdict in words: "Correct. Here is why", "Not quite", "Why". */
  title: ReactNode;
}

/** The owl's face per verdict. A wrong answer gets the encouraging `tip` wink, never a sad face. */
const FACES: Record<ExplanationVerdict, MascotState> = {
  correct: 'success',
  incorrect: 'tip',
  neutral: 'info',
};

/**
 * Feedback on an answer: why it is right, or a nudge to try again. A live region by default
 * (`role="status"`), so the verdict and the reason are announced; pass `role="note"` where it is
 * not new (a review list).
 */
export function Explanation({
  verdict = 'neutral',
  title,
  className,
  children,
  ...rest
}: ExplanationProps) {
  return (
    <div
      className={cx('g-explanation', `g-explanation--${verdict}`, className)}
      role="status"
      {...rest}
    >
      <Mascot state={FACES[verdict]} variant="face" size={32} className="g-explanation__icon" />
      <div className="g-explanation__body">
        <p className="g-explanation__title">{title}</p>
        {children}
      </div>
    </div>
  );
}
