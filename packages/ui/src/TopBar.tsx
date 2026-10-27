import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import './topbar.css';

/** Class for the back link, so a router `Link` can wear it: `<Link className={topBarBackClass}>`. */
export const topBarBackClass = 'g-topbar__back';

export interface TopBarProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** The page title (rendered as the `h1`), drawn in the display face. */
  title: ReactNode;
  /** A back link or button; give it `topBarBackClass` for the right look. */
  back?: ReactNode;
  /** Progress or save state on the right (a `ProgressBar`, "Saved"). */
  status?: ReactNode;
  /** The primary action, usually a `chrome` button. */
  actions?: ReactNode;
}

/** The dark top bar of focused screens: lesson player, Pariksha, editors. */
export function TopBar({ title, back, status, actions, className, ...rest }: TopBarProps) {
  return (
    <header className={cx('g-topbar', className)} {...rest}>
      {back}
      <h1 className="g-topbar__title">{title}</h1>
      {status ? <div className="g-topbar__status">{status}</div> : null}
      {actions ? <div className="g-topbar__actions">{actions}</div> : null}
    </header>
  );
}
