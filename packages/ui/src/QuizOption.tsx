import type { InputHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import { CheckIcon, XIcon } from './Icon';
import './quiz-option.css';

export type QuizOptionLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';
export type QuizOptionState = 'idle' | 'correct' | 'incorrect' | 'locked';

export interface QuizOptionProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'checked' | 'onChange' | 'children' | 'disabled'
> {
  /** The answer text. */
  children: ReactNode;
  /** Badge letter, `A` to `H` (a question has up to eight answers). */
  letter: QuizOptionLetter;
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

const VERDICT: Record<'correct' | 'incorrect', { text: string; Icon: typeof CheckIcon }> = {
  correct: { text: 'Correct', Icon: CheckIcon },
  incorrect: { text: 'Incorrect', Icon: XIcon },
};

/**
 * One answer to a Quiz question. A real radio or checkbox inside its label, so the keyboard
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
          <verdict.Icon strokeWidth={1.75} />
          {verdict.text}
        </span>
      ) : null}
    </label>
  );
}
