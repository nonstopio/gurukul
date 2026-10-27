import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import './callout.css';

export type CalloutTone = 'note' | 'tip' | 'warning';

export interface CalloutProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** `note` is informational, `tip` a suggestion, `warning` something that can go wrong. */
  tone?: CalloutTone;
  /** Bold lead-in, e.g. "Heads up". */
  title: ReactNode;
}

const ICON_PATHS: Record<CalloutTone, string> = {
  note: 'M8 7v4.5M8 4.5v.01',
  tip: 'M8 3a3.5 3.5 0 0 0-2 6.4V11h4V9.4A3.5 3.5 0 0 0 8 3zM6.5 13h3',
  warning: 'M8 4.5v4M8 11v.01',
};

/** An inline box for a note, tip or warning inside lesson prose or a form. */
export function Callout({ tone = 'note', title, className, children, ...rest }: CalloutProps) {
  return (
    <div className={cx('g-callout', `g-callout--${tone}`, className)} role="note" {...rest}>
      <svg
        className="g-callout__icon"
        viewBox="0 0 16 16"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {tone === 'tip' ? null : <circle cx="8" cy="8" r="6.5" />}
        <path d={ICON_PATHS[tone]} />
      </svg>
      <div className="g-callout__body">
        <p className="g-callout__title">{title}</p>
        {children}
      </div>
    </div>
  );
}
