import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import { Mascot } from './Mascot';
import type { MascotState } from './Mascot';
import './state-card.css';

export type StateCardVariant = 'error' | 'offline' | 'forbidden';

export interface StateCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** `error`: something failed (announced at once). `offline`: no connection. `forbidden`: no access. */
  variant: StateCardVariant;
  /** What happened, in words: "We couldn't load this course". */
  title: string;
  /** Heading level to fit the page outline. Default: `h3`. */
  headingAs?: 'h2' | 'h3' | 'h4';
  /** The error code in the mono face, such as `NET-TIMEOUT`. */
  code?: string;
  /** The error type next to the code, such as "Network". */
  kind?: string;
  /** Retry, or the way back: usually one primary `Button` and one secondary. */
  actions?: ReactNode;
  /** One or two sentences: why, and what to do. */
  children?: ReactNode;
}

/** The owl's state per variant; the title says what happened in words. No access is a puzzle, not a sorrow. */
const FACES: Record<StateCardVariant, MascotState> = {
  error: 'error',
  offline: 'warning',
  forbidden: 'validation',
};

/**
 * A block for a region that could not be shown: failed to load, offline, or not allowed. Empty has
 * its own component, `EmptyState`; this one never says "nothing here".
 */
export function StateCard({
  variant,
  title,
  headingAs: Heading = 'h3',
  code,
  kind,
  actions,
  className,
  children,
  ...rest
}: StateCardProps) {
  const role = variant === 'error' ? 'alert' : variant === 'offline' ? 'status' : undefined;
  return (
    <div className={cx('g-state', `g-state--${variant}`, className)} role={role} {...rest}>
      <Mascot state={FACES[variant]} size={64} className="g-state__icon" />
      <Heading className="g-state__title">{title}</Heading>
      {children ? <p className="g-state__text">{children}</p> : null}
      {code ? <code className="g-state__code">{kind ? `${code} · ${kind}` : code}</code> : null}
      {actions ? <div className="g-state__actions">{actions}</div> : null}
    </div>
  );
}
