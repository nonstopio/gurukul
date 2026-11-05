import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { cx } from './cx';
import { AlertIcon } from './Icon';
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
  /** For a control a `<label>` cannot name (a `div role="combobox"`): what a label click does. */
  onLabelClick?: (() => void) | undefined;
}

/**
 * A label above a control, with optional hint and error. Use `Input`, `Select` or `Textarea`. The
 * label's id is the control's id plus `-label`, for a control named by `aria-labelledby`.
 */
export function Field({
  label,
  hideLabel,
  hint,
  error,
  id,
  className,
  children,
  onLabelClick,
}: FieldProps) {
  const uid = useId();
  const controlId = id ?? `${uid}-control`;
  const hintId = `${uid}-hint`;
  const errorId = `${uid}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  return (
    <div className={cx('g-field', className)}>
      {/* A label click is a pointer convenience; the keyboard reaches the control directly. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <label
        className={cx('g-field__label', hideLabel && 'g-visually-hidden')}
        htmlFor={controlId}
        id={`${controlId}-label`}
        onClick={onLabelClick}
      >
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
