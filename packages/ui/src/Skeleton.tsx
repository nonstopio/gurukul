import type { CSSProperties, HTMLAttributes } from 'react';
import { cx } from './cx';
import './skeleton.css';

export interface SkeletonProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** `text` is one line, `block` a rectangle, `circle` an avatar. Default: `text`. */
  shape?: 'text' | 'block' | 'circle';
  /** CSS width, e.g. `"60%"` or `120`. Default: full width (circle: its height). */
  width?: CSSProperties['width'];
  /** CSS height. Default: one line of text (block: 6rem, circle: 40px). */
  height?: CSSProperties['height'];
}

/**
 * A still placeholder shown while content loads. It is hidden from assistive tech: mark the
 * loading region `aria-busy="true"` instead. It does not animate, so reduced motion needs no case.
 */
export function Skeleton({
  shape = 'text',
  width,
  height,
  className,
  style,
  ...rest
}: SkeletonProps) {
  return (
    <span
      className={cx('g-skeleton', `g-skeleton--${shape}`, className)}
      style={{ width, height, ...style }}
      aria-hidden="true"
      {...rest}
    />
  );
}
