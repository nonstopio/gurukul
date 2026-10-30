import type { InputHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import './check.css';

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** The visible label beside the dot. Without one, give the radio an `aria-label`. */
  label?: ReactNode;
}

/** A round choice we draw ourselves, the one-of-many partner of `Checkbox`: same size, same fill. */
export function Radio({ label, className, ...rest }: RadioProps) {
  return (
    <label className={cx('g-check', 'g-check--radio', className)}>
      <input className="g-check__input" type="radio" {...rest} />
      <span className="g-check__box" aria-hidden="true">
        <span className="g-check__dot" />
      </span>
      {label ? <span className="g-check__label">{label}</span> : null}
    </label>
  );
}
