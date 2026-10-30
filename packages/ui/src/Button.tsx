import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './button.css';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'quiet'
  | 'danger'
  | 'danger-quiet'
  | 'chrome'
  | 'chrome-secondary';

export type ButtonSize = 'md' | 'sm';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual weight. One `primary` per view; `danger` only to confirm a destructive action; `quiet` and `danger-quiet` are the borderless actions in a dense row (Rename; Delete, which starts a confirmation). Default: `primary`. */
  variant?: ButtonVariant;
  /** `sm` (36px) is for dense rows only. Default: `md` (44px). */
  size?: ButtonSize;
  /** Leading icon, decorative: it is hidden from assistive tech. */
  icon?: ReactNode;
  /** Waiting on the click: disabled, `aria-busy`, a spinner in place of the icon, label kept. */
  loading?: boolean;
}

/**
 * The Gurukul button. A real `<button>`, 44px tall, focus ring from tokens.
 * Use `<a className={buttonClass(...)}>` for navigation instead of wrapping one.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  className,
  type = 'button',
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(variant, className, size)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <span className="g-btn__spinner" aria-hidden="true" />
      ) : icon ? (
        <span className="g-btn__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
}

/** Class list for a button-styled element, so links can look like buttons. */
export function buttonClass(
  variant: ButtonVariant = 'primary',
  extra?: string,
  size: ButtonSize = 'md',
): string {
  return ['g-btn', `g-btn--${variant}`, size === 'sm' && 'g-btn--sm', extra]
    .filter(Boolean)
    .join(' ');
}
