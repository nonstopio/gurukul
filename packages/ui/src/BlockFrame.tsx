import type { ReactNode } from 'react';
import { cx } from './cx';
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

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
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
            <Icon>
              <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
              <path d="M10.5 3.5A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9a1.5 1.5 0 0 0 1.5 1.5" />
            </Icon>
          </button>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            className="g-block__icon"
            aria-label={`Delete ${label} block`}
            onClick={onDelete}
          >
            <Icon>
              <path d="M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.6 8.5h6.8l.6-8.5" />
            </Icon>
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="g-block__error" role="alert">
          <Icon>
            <circle cx="8" cy="8" r="6.5" />
            <path d="M8 4.5V8.5M8 11h.01" />
          </Icon>
          {error}
        </p>
      ) : null}
      <div className="g-block__body">{children}</div>
    </div>
  );
}
