import type { ReactNode } from 'react';
import type { NavItemRenderProps } from './NavItem';
import './area-switcher.css';

export interface AreaSwitcherItem {
  /** Stable key: the area's slug. */
  id: string;
  label: string;
  /** Where the area starts. */
  href: string;
  /** The area the person is in: `aria-current="page"` and the active style. */
  current?: boolean;
  /** Draws the anchor yourself so a router owns navigation, as `NavItem`'s `render`. */
  render?: (props: NavItemRenderProps) => ReactNode;
}

export interface AreaSwitcherProps {
  /** Accessible name of the landmark. Default: "Areas". */
  label?: string;
  /** The areas this person may open. The caller renders it only when there is more than one. */
  items: readonly AreaSwitcherItem[];
}

/** A compact row of links at the top of the sidebar: Learn, Studio, Admin. Tab reaches each link. */
export function AreaSwitcher({ label = 'Areas', items }: AreaSwitcherProps) {
  return (
    <nav className="g-area-switcher" aria-label={label}>
      {items.map(({ id, label: text, href, current, render }) => {
        const props: NavItemRenderProps = {
          href,
          className: 'g-area-switcher__item',
          'aria-current': current ? 'page' : undefined,
          children: text,
        };
        return render ? (
          <span key={id} className="g-area-switcher__slot">
            {render(props)}
          </span>
        ) : (
          <a key={id} {...props}>
            {text}
          </a>
        );
      })}
    </nav>
  );
}
