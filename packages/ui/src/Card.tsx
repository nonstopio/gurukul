import type { HTMLAttributes } from 'react';
import { cx } from './cx';
import './card.css';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** The element to render. Default: `div`. */
  as?: 'div' | 'section' | 'article' | 'li';
  /** Marks the one card that matters now (the current chapter): accent border and pale ground. */
  highlighted?: boolean;
}

/** A hairline-bordered surface. It rests flat: no shadow. */
export function Card({ as: Tag = 'div', highlighted = false, className, ...rest }: CardProps) {
  return (
    <Tag className={cx('g-card', highlighted && 'g-card--highlighted', className)} {...rest} />
  );
}
