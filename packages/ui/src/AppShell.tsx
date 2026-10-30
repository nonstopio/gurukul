// The sidebar layout. At ≥ 64rem the sidebar is a sticky, full-height column; below it is a drawer
// opened from the Menu button in the sticky top bar. CSS media queries pick the look; this file
// only owns the open state, focus and the keys.

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { buttonClass } from './Button';
import { cx } from './cx';
import { MenuIcon } from './Icon';
import './app-shell.css';

export interface AppShellProps {
  /** A `Sidebar`. AppShell wraps it in the container the Menu button controls. */
  sidebar: ReactNode;
  /** Top bar content, right-aligned (global search). */
  bar?: ReactNode;
  /** The Menu button's label. Default: "Menu". */
  menuLabel?: string;
  /** Id of the sidebar container, named by the Menu button's `aria-controls`. Default: `app-sidebar`. */
  sidebarId?: string | undefined;
  /** When it changes the drawer closes: pass the pathname. */
  navKey?: string | undefined;
  /** The content column; the app renders its own `<main>` here. */
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const DESKTOP = '(min-width: 64rem)';

export function AppShell({
  sidebar,
  bar,
  menuLabel = 'Menu',
  sidebarId = 'app-sidebar',
  navKey,
  children,
}: AppShellProps) {
  const [open, setOpen] = useState(false);
  const [seenKey, setSeenKey] = useState(navKey);
  if (navKey !== seenKey) {
    setSeenKey(navKey);
    setOpen(false);
  }
  const drawer = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLButtonElement>(null);
  // Set when Escape or the scrim closes the drawer: focus goes back to the Menu button once the
  // content column is no longer inert. Navigating leaves focus to the new page.
  const restore = useRef(false);
  const dismiss = () => {
    restore.current = true;
    setOpen(false);
  };

  useEffect(() => {
    if (!open) {
      if (restore.current) (menu.current as HTMLButtonElement).focus();
      restore.current = false;
      return;
    }
    (drawer.current as HTMLDivElement).querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      dismiss();
    };
    document.addEventListener('keydown', onKey);
    // Widened to desktop while open: there is no drawer any more, so the content must not stay inert.
    const wide = typeof window.matchMedia === 'function' ? window.matchMedia(DESKTOP) : null;
    const onWide = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };
    wide?.addEventListener('change', onWide);
    return () => {
      document.removeEventListener('keydown', onKey);
      wide?.removeEventListener('change', onWide);
    };
  }, [open]);

  return (
    <div className={cx('g-app-shell', open && 'g-app-shell--open')}>
      {open ? (
        <button
          type="button"
          className="g-app-shell__scrim"
          aria-label={`Close ${menuLabel.toLowerCase()}`}
          tabIndex={-1}
          onClick={dismiss}
        />
      ) : null}
      <div className="g-app-shell__sidebar" id={sidebarId} ref={drawer}>
        {sidebar}
      </div>
      <div className="g-app-shell__content" inert={open}>
        <div className="g-app-shell__bar">
          <button
            ref={menu}
            type="button"
            className={buttonClass('secondary', 'g-app-shell__menu')}
            aria-expanded={open}
            aria-controls={sidebarId}
            onClick={() => setOpen((o) => !o)}
          >
            <span className="g-btn__icon" aria-hidden="true">
              <MenuIcon />
            </span>
            {menuLabel}
          </button>
          {bar}
        </div>
        {children}
      </div>
    </div>
  );
}
