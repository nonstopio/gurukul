import type { ReactNode } from 'react';
import { cx } from './cx';
import { CheckIcon } from './Icon';
import './choice-card.css';

export interface ChoiceCardProps {
  /** The thing's icon in the tile on the left (a team, a person): an icon, never a logo or photo. */
  icon: ReactNode;
  title: string;
  /** One quiet line under the title: a member count, an email. */
  meta?: ReactNode;
  selected: boolean;
  onSelectedChange: (next: boolean) => void;
  /** The checkbox's accessible name. Default: `title`. */
  selectLabel?: string | undefined;
  /** Not pickable, e.g. at a limit; a card already picked can still be unpicked. */
  disabled?: boolean | undefined;
  /** The element to render. Default: `li`, for a list of choices. */
  as?: 'li' | 'div';
  className?: string | undefined;
}

/**
 * One option in a pick-many list (teams, people): a whole-card checkbox. Picking it rings the card
 * and pops the tick in. For courses use `CourseTile` with `onSelectedChange` instead.
 */
export function ChoiceCard({
  icon,
  title,
  meta,
  selected,
  onSelectedChange,
  selectLabel,
  disabled = false,
  as: Tag = 'li',
  className,
}: ChoiceCardProps) {
  return (
    <Tag
      className={cx('g-choice', disabled && 'g-choice--disabled', className)}
      data-selected={selected}
    >
      <label className="g-choice__label">
        <input
          type="checkbox"
          className="g-choice__input"
          checked={selected}
          aria-label={selectLabel ?? title}
          disabled={disabled}
          onChange={(e) => onSelectedChange(e.target.checked)}
        />
        <span className="g-choice__icon" aria-hidden="true">
          {icon}
        </span>
        <span className="g-choice__text">
          <span className="g-choice__title">{title}</span>
          {meta ? <span className="g-choice__meta">{meta}</span> : null}
        </span>
        <span className="g-choice__check" aria-hidden="true">
          <CheckIcon size={14} strokeWidth={2.5} />
        </span>
      </label>
    </Tag>
  );
}
