import type { InputHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import './quiz-option.css';

export type QuizOptionState = 'idle' | 'correct' | 'incorrect' | 'locked';

export interface QuizOptionProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'checked' | 'onChange' | 'children' | 'disabled'
> {
  /** The answer text. */
  children: ReactNode;
  /** Badge letter, `A` to `D`. */
  letter: 'A' | 'B' | 'C' | 'D';
  /** Whether this answer is picked. The caller owns it. */
  checked: boolean;
  /** Called with the new checked state. */
  onChange: (checked: boolean) => void;
  /** Several answers allowed: a checkbox. Default: a radio, one answer. */
  multiple?: boolean;
  /**
   * `idle` is open for answering (it looks selected while `checked`). `correct` and `incorrect`
   * show the result of a check; `locked` is closed with no verdict. The last three disable the input.
   */
  state?: QuizOptionState;
}

const VERDICT: Record<'correct' | 'incorrect', { text: string; path: string }> = {
  correct: { text: 'Correct', path: 'M3 8.5l3.5 3.5L13 4.5' },
  incorrect: { text: 'Incorrect', path: 'M4 4l8 8M12 4l-8 8' },
};

/**
 * One answer to a Pariksha question. A real radio or checkbox inside its label, so the keyboard
 * and screen readers work as they do natively. The verdict is spoken and written, never colour alone.
 */
export function QuizOption({
  children,
  letter,
  checked,
  onChange,
  multiple = false,
  state = 'idle',
  className,
  ...rest
}: QuizOptionProps) {
  const visual = state === 'idle' ? (checked ? 'selected' : 'idle') : state;
  const verdict = state === 'correct' || state === 'incorrect' ? VERDICT[state] : null;
  return (
    <label className={cx('g-quiz-option', `g-quiz-option--${visual}`, className)}>
      <input
        className="g-quiz-option__input"
        type={multiple ? 'checkbox' : 'radio'}
        checked={checked}
        disabled={state !== 'idle'}
        onChange={(event) => onChange(event.target.checked)}
        {...rest}
      />
      <span className="g-quiz-option__letter" aria-hidden="true">
        {letter}
      </span>
      <span className="g-quiz-option__text">{children}</span>
      {verdict ? (
        <span className="g-quiz-option__verdict">
          <svg
            viewBox="0 0 16 16"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d={verdict.path} />
          </svg>
          {verdict.text}
        </span>
      ) : null}
    </label>
  );
}
