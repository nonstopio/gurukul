import type { HTMLAttributes } from 'react';
import { cx } from './cx';
import './chip.css';

export type ChipTone = 'neutral' | 'accent' | 'warning' | 'danger' | 'info' | 'solid';

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  /** Meaning of the chip. Default: `neutral`. `solid` is for "Completed". */
  tone?: ChipTone;
}

/** A small status label. It always carries a word; colour alone never says anything. */
export function Chip({ tone = 'neutral', className, ...rest }: ChipProps) {
  return <span className={cx('g-chip', `g-chip--${tone}`, className)} {...rest} />;
}
