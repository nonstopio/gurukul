import { useId } from 'react';
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cx } from './cx';
import './field.css';

/** What a `Field` hands its control so label, hint and error are wired for assistive tech. */
export interface FieldControlProps {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': true | undefined;
}

export interface FieldProps {
  /** The visible label, always shown above the control. */
  label: string;
  /** Help text under the label. */
  hint?: string | undefined;
  /** Error text. When set, the control is `aria-invalid` and the message is linked to it. */
  error?: string | undefined;
  /** Id for the control; generated when omitted. */
  id?: string | undefined;
  className?: string | undefined;
  /** Render the control with the props it must carry. */
  children: (control: FieldControlProps) => ReactNode;
}

/** A label above a control, with optional hint and error. Use `Input`, `Select` or `Textarea`. */
export function Field({ label, hint, error, id, className, children }: FieldProps) {
  const uid = useId();
  const controlId = id ?? `${uid}-control`;
  const hintId = `${uid}-hint`;
  const errorId = `${uid}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  return (
    <div className={cx('g-field', className)}>
      <label className="g-field__label" htmlFor={controlId}>
        {label}
      </label>
      {hint ? (
        <p className="g-field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {children({
        id: controlId,
        'aria-describedby': describedBy || undefined,
        'aria-invalid': error ? true : undefined,
      })}
      {error ? (
        <p className="g-field__error" id={errorId}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 4.5v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="8" cy="11" r="0.9" fill="currentColor" />
          </svg>
          {error}
        </p>
      ) : null}
    </div>
  );
}

type Shared = Pick<FieldProps, 'label' | 'hint' | 'error'>;

export interface InputProps extends InputHTMLAttributes<HTMLInputElement>, Shared {}

/** A labelled text input. */
export function Input({ label, hint, error, id, className, ...rest }: InputProps) {
  return (
    <Field label={label} hint={hint} error={error} id={id} className={className}>
      {(control) => <input className="g-control" {...rest} {...control} />}
    </Field>
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement>, Shared {}

/** A labelled native select. Pass `<option>`s as children. */
export function Select({ label, hint, error, id, className, children, ...rest }: SelectProps) {
  return (
    <Field label={label} hint={hint} error={error} id={id} className={className}>
      {(control) => (
        <select className="g-control g-control--select" {...rest} {...control}>
          {children}
        </select>
      )}
    </Field>
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, Shared {}

/** A labelled textarea. */
export function Textarea({ label, hint, error, id, className, ...rest }: TextareaProps) {
  return (
    <Field label={label} hint={hint} error={error} id={id} className={className}>
      {(control) => <textarea className="g-control g-control--textarea" {...rest} {...control} />}
    </Field>
  );
}
