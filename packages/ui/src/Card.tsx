import { useId } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import './card.css';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** The element to render. Default: `div`, or `section` when the card has a `title`. */
  as?: 'div' | 'section' | 'article' | 'li';
  /** Marks the one card that matters now (the current chapter): accent border and pale ground. */
  highlighted?: boolean;
  /** A heading for the card; it also names the card's region. */
  title?: ReactNode;
  /** The heading level of `title`. Default: `h2`. */
  titleAs?: 'h2' | 'h3';
  /** Actions on the right of the title (a link, a small button, a `Menu`). */
  actions?: ReactNode;
}

/** A hairline-bordered surface. It rests flat: no shadow. With a `title`, a page section. */
export function Card({
  as,
  highlighted = false,
  title,
  titleAs: Heading = 'h2',
  actions,
  className,
  children,
  ...rest
}: CardProps) {
  const titleId = useId();
  const Tag = as ?? (title ? 'section' : 'div');
  return (
    <Tag
      className={cx('g-card', highlighted && 'g-card--highlighted', className)}
      aria-labelledby={title ? titleId : undefined}
      {...rest}
    >
      {title ? (
        <div className="g-card__head">
          <Heading className="g-card__title" id={titleId}>
            {title}
          </Heading>
          {actions ? <div className="g-card__actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </Tag>
  );
}
