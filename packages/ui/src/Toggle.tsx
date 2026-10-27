import type { InputHTMLAttributes } from 'react';
import { cx } from './cx';
import './toggle.css';

export interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** The visible label, always shown beside the switch. */
  label: string;
}

/** A switch. It is a real checkbox with `role="switch"`: Space toggles, Tab reaches it. */
export function Toggle({ label, className, ...rest }: ToggleProps) {
  return (
    <label className={cx('g-toggle', className)}>
      <input className="g-toggle__input" type="checkbox" role="switch" {...rest} />
      <span className="g-toggle__track" aria-hidden="true" />
      <span className="g-toggle__label">{label}</span>
    </label>
  );
}
