import { useId } from 'react';
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cx } from './cx';
import { AlertIcon, ChevronDownIcon } from './Icon';
import './field.css';

/** What a `Field` hands its control so label, hint and error are wired for assistive tech. */
export interface FieldControlProps {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': true | undefined;
}

export interface FieldProps {
  /** The label, shown above the control. */
  label: string;
  /** Hides the label visually; it stays the control's accessible name. Only inside `FilterBar`. */
  hideLabel?: boolean | undefined;
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
export function Field({ label, hideLabel, hint, error, id, className, children }: FieldProps) {
  const uid = useId();
  const controlId = id ?? `${uid}-control`;
  const hintId = `${uid}-hint`;
  const errorId = `${uid}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  return (
    <div className={cx('g-field', className)}>
      <label className={cx('g-field__label', hideLabel && 'g-visually-hidden')} htmlFor={controlId}>
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
          <AlertIcon />
          {error}
        </p>
      ) : null}
    </div>
  );
}

type Shared = Pick<FieldProps, 'label' | 'hideLabel' | 'hint' | 'error'>;

export interface InputProps extends InputHTMLAttributes<HTMLInputElement>, Shared {}

/** A labelled text input. */
export function Input({ label, hideLabel, hint, error, id, className, ...rest }: InputProps) {
  return (
    <Field
      label={label}
      hideLabel={hideLabel}
      hint={hint}
      error={error}
      id={id}
      className={className}
    >
      {(control) => <input className="g-control" {...rest} {...control} />}
    </Field>
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement>, Shared {}

/** A labelled native select with our chevron. Pass `<option>`s as children. */
export function Select({
  label,
  hideLabel,
  hint,
  error,
  id,
  className,
  children,
  ...rest
}: SelectProps) {
  return (
    <Field
      label={label}
      hideLabel={hideLabel}
      hint={hint}
      error={error}
      id={id}
      className={className}
    >
      {(control) => (
        <span className="g-select">
          <select className="g-control g-control--select" {...rest} {...control}>
            {children}
          </select>
          <ChevronDownIcon className="g-select__chevron" />
        </span>
      )}
    </Field>
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, Shared {}

/** A labelled textarea. */
export function Textarea({ label, hideLabel, hint, error, id, className, ...rest }: TextareaProps) {
  return (
    <Field
      label={label}
      hideLabel={hideLabel}
      hint={hint}
      error={error}
      id={id}
      className={className}
    >
      {(control) => <textarea className="g-control g-control--textarea" {...rest} {...control} />}
    </Field>
  );
}
