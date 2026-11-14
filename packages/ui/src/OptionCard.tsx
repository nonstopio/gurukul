import type { CSSProperties, ReactNode } from 'react';
import { cx } from './cx';
import './field.css';
import './option-card.css';

export interface OptionCardProps {
  /** The option's name, at the head of the card. */
  title: string;
  /** The footer button's words. The card is one button; this is its call to action. */
  cta: string;
  /** The button's accessible name. Default: `cta`. */
  label?: string | undefined;
  /** An id for the rows; the button is described by them, so a screen reader reads them on focus. */
  bodyId?: string | undefined;
  /** Picks this option. */
  onSelect: () => void;
  /** Called with true when the pointer or focus arrives, false when it leaves: a preview, not a pick. */
  onPreview?: ((active: boolean) => void) | undefined;
  /** Shown as the one being looked at (accent ground), whatever the cause. */
  active?: boolean | undefined;
  /**
   * Rows of the parent grid this card spans. Given, the card lays its title, rows and call to
   * action on those rows (`subgrid`), so two cards side by side line up row for row.
   */
  rows?: number | undefined;
  /** `OptionCardGroup` and `OptionCardRow` children. */
  children: ReactNode;
  className?: string | undefined;
}

/**
 * A pick-one card that is a single button: a title, rows of detail and a call to action at its
 * foot. Click anywhere on it to choose; hover and focus only preview (`onPreview`). Use two or
 * three side by side for a decision with a few big options; for a pick-many list use `ChoiceCard`.
 */
export function OptionCard({
  title,
  cta,
  label,
  bodyId,
  onSelect,
  onPreview,
  active = false,
  rows,
  children,
  className,
}: OptionCardProps) {
  return (
    <button
      type="button"
      className={cx('g-option', rows !== undefined && 'g-option--rows', className)}
      style={rows === undefined ? undefined : ({ '--option-rows': rows } as CSSProperties)}
      data-active={active}
      aria-label={label ?? cta}
      aria-describedby={bodyId}
      onClick={onSelect}
      onMouseEnter={() => onPreview?.(true)}
      onMouseLeave={() => onPreview?.(false)}
      onFocus={() => onPreview?.(true)}
      onBlur={() => onPreview?.(false)}
    >
      <span className="g-option__title">{title}</span>
      <span id={bodyId} className="g-option__body">
        {children}
      </span>
      <span className="g-option__cta" aria-hidden="true">
        {cta}
      </span>
    </button>
  );
}

/** A small caption over some rows ("People"). */
export function OptionCardGroup({ children }: { children: ReactNode }) {
  return <span className="g-option__group">{children}</span>;
}

/**
 * One row: a bold line and a quiet note under it. A hidden ", " and ". " keep the two apart
 * when a screen reader reads the card's description as one run.
 */
export function OptionCardRow({ title, note }: { title: string; note?: string | undefined }) {
  return (
    <span className="g-option__row">
      {title}
      {note ? (
        <>
          <span className="g-visually-hidden">, </span>
          <span className="g-option__note">{note}</span>
        </>
      ) : null}
      <span className="g-visually-hidden">. </span>
    </span>
  );
}
