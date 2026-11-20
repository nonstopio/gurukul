import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import { PenIcon, PlusIcon, SwapIcon, TrashIcon } from './Icon';
import './change-mark.css';

export type ChangeMarkStatus = 'added' | 'changed' | 'moved' | 'removed';

export interface ChangeMarkProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** What happened to it, at least one. The first sets the tone; a moved and changed block passes both. */
  statuses: readonly [ChangeMarkStatus, ...ChangeMarkStatus[]];
  /** What it is, in words: "Text block". Shown after the status and part of the accessible name. */
  what: string;
  /** The thing itself, as it is now. Left out for something removed: only the mark is drawn. */
  children?: ReactNode;
}

const WORD: Record<ChangeMarkStatus, string> = {
  added: 'Added',
  changed: 'Changed',
  moved: 'Moved',
  removed: 'Removed',
};

const SIGN: Record<ChangeMarkStatus, ReactNode> = {
  added: <PlusIcon size={14} />,
  changed: <PenIcon size={14} />,
  moved: <SwapIcon size={14} />,
  removed: <TrashIcon size={14} />,
};

/**
 * A changed piece of a course, marked where it is drawn (a session's preview): a dashed hairline
 * round it and a label that says what happened with a sign and a word, never colour alone. The
 * group is named "changed: Text block" ("changed and moved: …" for two), so a screen reader hears
 * it before the content.
 */
export function ChangeMark({ statuses, what, children, className, ...rest }: ChangeMarkProps) {
  const [first] = statuses;
  const words = statuses.map((s) => WORD[s]);
  return (
    <div
      role="group"
      aria-label={`${words.join(' and ').toLowerCase()}: ${what}`}
      className={cx('g-change-mark', `g-change-mark--${first}`, className)}
      {...rest}
    >
      <p className="g-change-mark__label" aria-hidden="true">
        {SIGN[first]}
        <span>{`${words.join(' · ')} · ${what}`}</span>
      </p>
      {children !== undefined ? <div className="g-change-mark__body">{children}</div> : null}
    </div>
  );
}
