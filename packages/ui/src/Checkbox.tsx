import { useEffect, useRef } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import { CheckIcon, Icon } from './Icon';
import './check.css';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** The visible label beside the box. Without one, give the box an `aria-label`. */
  label?: ReactNode;
  /** Some, not all, of a group are ticked (a "select all" over a partial selection). */
  indeterminate?: boolean | undefined;
}

/**
 * A tick box we draw ourselves: a 22px rounded square that fills with the accent and pops the tick
 * in. It is a real checkbox underneath (Space toggles, Tab reaches it) with a 44px hit area. For a
 * setting that is on or off use `Toggle`; a checkbox is for ticking things in a list.
 */
export function Checkbox({ label, indeterminate = false, className, ...rest }: CheckboxProps) {
  const input = useRef<HTMLInputElement>(null);
  // `indeterminate` is a DOM property with no attribute.
  useEffect(() => {
    (input.current as HTMLInputElement).indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <label className={cx('g-check', className)}>
      <input ref={input} className="g-check__input" type="checkbox" {...rest} />
      <span className="g-check__box" aria-hidden="true">
        {indeterminate ? (
          <Icon size={14} strokeWidth={3}>
            <path d="M4 8h8" />
          </Icon>
        ) : (
          <CheckIcon size={14} strokeWidth={3} />
        )}
      </span>
      {label ? <span className="g-check__label">{label}</span> : null}
    </label>
  );
}
