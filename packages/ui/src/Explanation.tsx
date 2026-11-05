import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import { CheckIcon, InfoIcon, LightbulbIcon } from './Icon';
import './explanation.css';

export type ExplanationVerdict = 'correct' | 'incorrect' | 'neutral';

export interface ExplanationProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** The answer it explains: `correct` (success ground), `incorrect` (warning ground), `neutral` (no verdict). */
  verdict?: ExplanationVerdict;
  /** The lead-in, carrying the verdict in words: "Correct. Here is why", "Not quite", "Why". */
  title: ReactNode;
}

const ICONS: Record<ExplanationVerdict, typeof InfoIcon> = {
  correct: CheckIcon,
  incorrect: LightbulbIcon,
  neutral: InfoIcon,
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
  const Glyph = ICONS[verdict];
  return (
    <div
      className={cx('g-explanation', `g-explanation--${verdict}`, className)}
      role="status"
      {...rest}
    >
      <Glyph className="g-explanation__icon" size={18} />
      <div className="g-explanation__body">
        <p className="g-explanation__title">{title}</p>
        {children}
      </div>
    </div>
  );
}
