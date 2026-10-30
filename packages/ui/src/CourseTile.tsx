import { useState } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import { CheckIcon } from './Icon';
import './course-tile.css';

export type CourseTileTheme = 'forest' | 'sand' | 'sky' | 'stone';

export interface CourseTileProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** The course name. It is the heading's text and, with no image, what the cover shows. */
  title: string;
  /** The link that holds the title, e.g. `<Link to="…">{title}</Link>`. Default: the plain title. */
  heading?: ReactNode;
  /** The picture on the cover. Without one, or when it fails to load, the cover shows the name. */
  image?: string | undefined;
  /** The cover colour behind the name; the course's own colour. */
  theme: CourseTileTheme;
  /** Chips above the heading: level, visibility, status. */
  chips?: ReactNode;
  /** One or two sentences under the heading. */
  summary?: ReactNode;
  /** The small line at the foot: lessons, minutes. */
  meta?: ReactNode;
  /** A progress bar or other block between the summary and the meta line. */
  extra?: ReactNode;
  /** The element to render. Default: `article`. */
  as?: 'article' | 'li';
  /**
   * Makes the tile a choice: a checkbox badge on the cover, and a click anywhere on the tile toggles
   * it. Use a plain `heading` (no link). Pair with `selected` and `selectLabel`.
   */
  onSelectedChange?: ((next: boolean) => void) | undefined;
  selected?: boolean | undefined;
  /** The checkbox's accessible name, e.g. "Git, the NonStop Way". Default: `title`. */
  selectLabel?: string | undefined;
}

/**
 * A course as a grid tile: a cover (the course's picture, else its name on its own colour), chips,
 * the title as a link, a summary and a meta line. Every course list shows courses this way.
 */
export function CourseTile({
  title,
  heading,
  image,
  theme,
  chips,
  summary,
  meta,
  extra,
  as: Tag = 'article',
  onSelectedChange,
  selected = false,
  selectLabel,
  className,
  ...rest
}: CourseTileProps) {
  // A broken picture falls back to the name, remembered per image so a new URL gets a new try.
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = image && failed !== image;
  return (
    <Tag
      className={cx('g-course-tile', onSelectedChange && 'g-course-tile--choice', className)}
      data-selected={onSelectedChange ? selected : undefined}
      {...rest}
    >
      {onSelectedChange ? (
        <label className="g-course-tile__select">
          <input
            type="checkbox"
            className="g-course-tile__input"
            checked={selected}
            aria-label={selectLabel ?? title}
            onChange={(e) => onSelectedChange(e.target.checked)}
          />
          <span className="g-course-tile__check" aria-hidden="true">
            <CheckIcon size={16} strokeWidth={2.5} />
          </span>
        </label>
      ) : null}
      <div className={`g-course-tile__cover g-course-tile__cover--${theme}`} aria-hidden="true">
        {showImage ? (
          <img src={image} alt="" loading="lazy" onError={() => setFailed(image)} />
        ) : (
          <span className="g-course-tile__name">{title}</span>
        )}
      </div>
      <div className="g-course-tile__body">
        {chips ? <div className="g-course-tile__chips">{chips}</div> : null}
        <h2 className="g-course-tile__title">{heading ?? title}</h2>
        {summary ? <p className="g-course-tile__summary">{summary}</p> : null}
        {extra}
        {meta ? <p className="g-course-tile__meta">{meta}</p> : null}
      </div>
    </Tag>
  );
}
