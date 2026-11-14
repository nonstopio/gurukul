import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cx } from './cx';
import { Mascot } from './Mascot';
import type { MascotState } from './Mascot';
import './callout.css';

export type CalloutTone = 'note' | 'tip' | 'warning';

export interface CalloutProps extends Omit<ComponentPropsWithRef<'div'>, 'title'> {
  /** `note` is informational, `tip` a suggestion, `warning` something that can go wrong. */
  tone?: CalloutTone;
  /** Bold lead-in, e.g. "Heads up". */
  title: ReactNode;
  /** The owl's state when the moment is more specific than the tone, such as a failed load (`error`). Default: by tone. */
  mascot?: MascotState;
}

/** The owl's face for each tone; the title says the tone in words. */
const FACES: Record<CalloutTone, MascotState> = {
  note: 'info',
  tip: 'tip',
  warning: 'warning',
};

/** An inline box for a note, tip or warning inside lesson prose or a form, led by the owl's face. */
export function Callout({
  tone = 'note',
  title,
  mascot,
  className,
  children,
  ...rest
}: CalloutProps) {
  return (
    <div className={cx('g-callout', `g-callout--${tone}`, className)} role="note" {...rest}>
      <Mascot state={mascot ?? FACES[tone]} variant="face" size={32} className="g-callout__icon" />
      <div className="g-callout__body">
        <p className="g-callout__title">{title}</p>
        {children}
      </div>
    </div>
  );
}
