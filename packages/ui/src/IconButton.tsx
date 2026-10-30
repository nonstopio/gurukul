import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import './icon-button.css';

export type IconButtonTone = 'neutral' | 'danger';

/** The class of a small icon button, for a `Menu` trigger that must look like one. */
export function iconButtonClass(tone: IconButtonTone = 'neutral', extra?: string): string {
  return cx('g-iconbtn', tone === 'danger' && 'g-iconbtn--danger', extra);
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** The accessible name: what the button does to this thing, e.g. "Rename What Git solves". */
  label: string;
  /** The short tooltip shown on hover and focus, e.g. "Rename". Default: `label`. */
  tip?: string;
  /** `danger` is the delete or remove that starts a confirmation. Default: `neutral`. */
  tone?: IconButtonTone;
  /** The icon, decorative. */
  children: ReactNode;
}

/**
 * A 36px icon-only button for dense rows (rename, move, delete). Quiet until hovered, with a tooltip
 * from `tip`. Use `Button` for anything with a visible label.
 */
export function IconButton({
  label,
  tip,
  tone = 'neutral',
  className,
  type = 'button',
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={iconButtonClass(tone, className)}
      aria-label={label}
      data-tip={tip ?? label}
      {...rest}
    >
      {children}
    </button>
  );
}
