import type { ReactNode } from 'react';
import { cx } from './cx';
import { AlertIcon, CopyIcon, TrashIcon } from './Icon';
import './block-frame.css';

export interface BlockFrameProps {
  /** The block's type as a micro label, e.g. "VIDEO". */
  label: string;
  /** The drag grip, from a `DragList` row. */
  handle?: ReactNode;
  /** Type-specific controls shown in the header. */
  controls?: ReactNode;
  /** Shows the Duplicate button when given. */
  onDuplicate?: () => void;
  /** Shows the Delete button when given. */
  onDelete?: () => void;
  selected?: boolean;
  /** A validation message shown under the header, announced as an alert. */
  error?: string;
  children: ReactNode;
}

/** The framed card for one content block or question in an editor. */
export function BlockFrame({
  label,
  handle,
  controls,
  onDuplicate,
  onDelete,
  selected,
  error,
  children,
}: BlockFrameProps) {
  return (
    <div
      className={cx('g-block', selected && 'g-block--selected', error && 'g-block--error')}
      role="group"
      aria-label={`${label} block`}
    >
      <div className="g-block__head">
        {handle}
        <span className="g-block__label">{label}</span>
        <div className="g-block__controls">{controls}</div>
        {onDuplicate ? (
          <button
            type="button"
            className="g-block__icon"
            aria-label={`Duplicate ${label} block`}
            onClick={onDuplicate}
          >
            <CopyIcon />
          </button>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            className="g-block__icon"
            aria-label={`Delete ${label} block`}
            onClick={onDelete}
          >
            <TrashIcon />
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="g-block__error" role="alert">
          <AlertIcon />
          {error}
        </p>
      ) : null}
      <div className="g-block__body">{children}</div>
    </div>
  );
}
