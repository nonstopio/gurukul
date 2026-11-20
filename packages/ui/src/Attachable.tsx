import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import { CheckIcon, PaperclipIcon } from './Icon';
import { IconButton } from './IconButton';
import './attachable.css';

export interface AttachableProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** What it is, in plain words: "Lesson 3.2 · Text block 2". Part of the button's name. */
  label: string;
  /** Whether it is attached now. */
  attached: boolean;
  /** Called with the new state when the button is pressed. */
  onAttachedChange: (attached: boolean) => void;
  /** The thing as it is drawn. Its own controls (a video, a check, Copy) keep working. */
  children: ReactNode;
}

/**
 * Something drawn that can be attached to a message (a block or a question in a Desktop Studio
 * session's preview): an Attach toggle button beside it, shown on hover and on keyboard focus, and
 * always while it is attached, when a solid outline goes round it and the button shows a tick. The
 * button is a real `aria-pressed` toggle, so attaching never needs a mouse.
 */
export function Attachable({
  label,
  attached,
  onAttachedChange,
  className,
  children,
  ...rest
}: AttachableProps) {
  return (
    <div className={cx('g-attachable', attached && 'g-attachable--attached', className)} {...rest}>
      <div className="g-attachable__body">{children}</div>
      <IconButton
        className="g-attachable__button"
        label={`Attach ${label} to your message`}
        tip={attached ? 'Attached' : 'Attach'}
        aria-pressed={attached}
        onClick={() => onAttachedChange(!attached)}
      >
        {attached ? <CheckIcon /> : <PaperclipIcon />}
      </IconButton>
    </div>
  );
}
