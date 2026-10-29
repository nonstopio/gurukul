import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import './topbar.css';

/** Class for the back link, so a router `Link` can wear it: `<Link className={topBarBackClass}>`. */
export const topBarBackClass = 'g-topbar__back';

export interface TopBarProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** The title, drawn in the display face: the page `h1` unless `titleAs` says otherwise. */
  title: ReactNode;
  /**
   * `p` when the page below has its own `h1` (the lesson's title under the course's), so the page
   * keeps one. Default: `h1`.
   */
  titleAs?: 'h1' | 'p';
  /** A back link or button; give it `topBarBackClass` for the right look. */
  back?: ReactNode;
  /** Progress or save state on the right (a `ProgressBar`, "Saved"). */
  status?: ReactNode;
  /** The primary action, usually a `chrome` button. */
  actions?: ReactNode;
}

/** The dark top bar of focused screens: lesson player, Pariksha, editors. */
export function TopBar({
  title,
  titleAs: Title = 'h1',
  back,
  status,
  actions,
  className,
  ...rest
}: TopBarProps) {
  return (
    <header className={cx('g-topbar', className)} {...rest}>
      {back}
      <Title className="g-topbar__title">{title}</Title>
      {status ? <div className="g-topbar__status">{status}</div> : null}
      {actions ? <div className="g-topbar__actions">{actions}</div> : null}
    </header>
  );
}
