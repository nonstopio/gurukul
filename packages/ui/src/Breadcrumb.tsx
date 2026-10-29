import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import { ChevronRightIcon } from './Icon';
import type { NavItemRenderProps } from './NavItem';
import './breadcrumb.css';

export interface BreadcrumbItem {
  label: ReactNode;
  /** Where the crumb goes. Not used on the last item, which is the current page. */
  href?: string;
  /** Draws the anchor yourself so a router owns navigation: `(p) => <Link to="/x" {...p} />`. */
  render?: (props: NavItemRenderProps) => ReactNode;
}

export interface BreadcrumbProps extends HTMLAttributes<HTMLElement> {
  items: BreadcrumbItem[];
  /** Accessible name of the landmark. Default: "Breadcrumb". */
  label?: string;
}

/** The path to the current page. The last item is the page itself and is not a link. */
export function Breadcrumb({ items, label = 'Breadcrumb', className, ...rest }: BreadcrumbProps) {
  return (
    <nav className={cx('g-breadcrumb', className)} aria-label={label} {...rest}>
      <ol className="g-breadcrumb__list">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          const props: NavItemRenderProps = {
            className: 'g-breadcrumb__link',
            children: item.label,
          };
          let crumb: ReactNode;
          if (last) {
            crumb = (
              <span className="g-breadcrumb__current" aria-current="page">
                {item.label}
              </span>
            );
          } else if (item.render) {
            crumb = item.render(props);
          } else if (item.href !== undefined) {
            crumb = (
              <a className="g-breadcrumb__link" href={item.href}>
                {item.label}
              </a>
            );
          } else {
            crumb = <span className="g-breadcrumb__text">{item.label}</span>;
          }
          return (
            <li key={i} className="g-breadcrumb__item">
              {crumb}
              {last ? null : <ChevronRightIcon className="g-breadcrumb__sep" size={14} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
