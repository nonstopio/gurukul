import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import './sidebar.css';

/** What `render` receives: spread it onto the element you draw (a router `Link`, say). */
export type NavItemRenderProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  className: string;
  children: ReactNode;
};

export interface NavItemProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> {
  children: ReactNode;
  /** The page the person is on: `aria-current="page"` and the active style. */
  current?: boolean;
  /** Leading icon, decorative: hidden from assistive tech. */
  icon?: ReactNode;
  /**
   * Draws the anchor yourself so a router can own navigation:
   * `render={(p) => <Link to="/courses" {...p} />}`. Default: a plain `<a>`.
   */
  render?: (props: NavItemRenderProps) => ReactNode;
}

/** A 44px navigation link for the sidebar. */
export function NavItem({
  children,
  current = false,
  icon,
  render,
  className,
  ...rest
}: NavItemProps) {
  const props: NavItemRenderProps = {
    ...rest,
    className: cx('g-nav-item', current && 'g-nav-item--current', className),
    'aria-current': current ? 'page' : undefined,
    children: (
      <>
        {icon ? (
          <span className="g-nav-item__icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        {children}
      </>
    ),
  };
  if (render) return render(props);
  const { children: content, ...anchor } = props;
  return <a {...anchor}>{content}</a>;
}
