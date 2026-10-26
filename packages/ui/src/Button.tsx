import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'chrome';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual weight. One `primary` per view. Default: `primary`. */
  variant?: ButtonVariant;
  /** Leading icon, decorative: it is hidden from assistive tech. */
  icon?: ReactNode;
}

/**
 * The Gurukul button. A real `<button>`, 44px tall, focus ring from tokens.
 * Use `<a className={buttonClass(...)}>` for navigation instead of wrapping one.
 */
export function Button({
  variant = 'primary',
  icon,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, className)} {...rest}>
      {icon ? (
        <span className="g-btn__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
}

/** Class list for a button-styled element, so links can look like buttons. */
export function buttonClass(variant: ButtonVariant = 'primary', extra?: string): string {
  return ['g-btn', `g-btn--${variant}`, extra].filter(Boolean).join(' ');
}
