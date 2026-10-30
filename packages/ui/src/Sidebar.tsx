import { useId } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import './sidebar.css';

export interface SidebarProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  /** Logo and product name, drawn in the display face. */
  brand: ReactNode;
  /** Accessible name of the navigation landmark, e.g. "Main". */
  label: string;
  /** Under the brand, above the navigation: an `AreaSwitcher` when the person can open more than one area. */
  switcher?: ReactNode;
  /** Pinned to the bottom (the signed-in person's card). */
  footer?: ReactNode;
  /** `NavItem`s and `SidebarGroup`s. */
  children: ReactNode;
}

/** The dark chrome sidebar: brand, navigation, optional pinned footer. */
export function Sidebar({
  brand,
  label,
  switcher,
  footer,
  children,
  className,
  ...rest
}: SidebarProps) {
  return (
    <aside className={cx('g-sidebar', className)} {...rest}>
      <div className="g-sidebar__brand">{brand}</div>
      {switcher ? <div className="g-sidebar__switcher">{switcher}</div> : null}
      <nav className="g-sidebar__nav" aria-label={label}>
        {children}
      </nav>
      {footer ? <div className="g-sidebar__footer">{footer}</div> : null}
    </aside>
  );
}

export interface SidebarGroupProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** The micro label heading the group. */
  label: string;
  children: ReactNode;
}

/** A labelled run of `NavItem`s inside a `Sidebar`. */
export function SidebarGroup({ label, children, className, ...rest }: SidebarGroupProps) {
  const id = useId();
  return (
    <div className={cx('g-sidebar__group', className)} role="group" aria-labelledby={id} {...rest}>
      <p className="g-sidebar__label" id={id}>
        {label}
      </p>
      {children}
    </div>
  );
}
