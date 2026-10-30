// A menu button (WAI-ARIA menu button pattern). The trigger opens a `role="menu"` panel under (or
// over) it; arrows, Home/End and a typed letter move between items, Enter/Space/click choose,
// Escape and an outside press close, and focus returns to the trigger. No portal: the panel is
// positioned against a wrapper, above dialogs by `--z-menu`.

import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { cx } from './cx';
import { MoreIcon } from './Icon';
import './menu.css';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  /** Leading icon, decorative. */
  icon?: ReactNode;
  /** Destructive: danger text. Place it last, after a separator. */
  danger?: boolean;
  /** Shown but not chosen, and skipped by the arrow keys. */
  disabled?: boolean;
  /** Short trailing text, e.g. the current value. */
  hint?: string;
}

export type MenuEntry = MenuItem | { separator: true };

export interface MenuProps {
  /**
   * The trigger's accessible name, and so the menu's. Required for the default icon trigger; leave
   * it out when `trigger` has visible text, which then names it (a label that differs from the
   * visible text fails WCAG 2.5.3).
   */
  label?: string | undefined;
  /** Trigger content. Default: a "more" icon. */
  trigger?: ReactNode;
  /** Replaces the default 44px icon-button styling of the trigger. */
  triggerClassName?: string;
  items: MenuEntry[];
  /** Which trigger edge the panel lines up with. Default: `end`. */
  align?: 'start' | 'end';
  /** Opens below or above the trigger. Default: `bottom`. */
  placement?: 'bottom' | 'top';
  /** On the wrapper that positions the panel. */
  className?: string;
}

const ENABLED = '[role="menuitem"]:not([aria-disabled="true"])';

export function Menu({
  label,
  trigger = <MoreIcon />,
  triggerClassName,
  items,
  align = 'end',
  placement = 'bottom',
  className,
}: MenuProps) {
  const id = useId();
  const triggerId = `${id}-trigger`;
  const menuId = `${id}-menu`;
  // Open, and which end gets focus on opening.
  const [open, setOpen] = useState<false | 'first' | 'last'>(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const enabled = () =>
    Array.from((panelRef.current as HTMLElement).querySelectorAll<HTMLElement>(ENABLED));

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) (triggerRef.current as HTMLElement).focus();
  };

  useEffect(() => {
    if (!open) return;
    const list = enabled();
    list[open === 'first' ? 0 : list.length - 1]?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!(wrapRef.current as HTMLElement).contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const onTriggerKey = (e: KeyboardEvent) => {
    const at = { ArrowDown: 'first', Enter: 'first', ' ': 'first', ArrowUp: 'last' } as const;
    const where = at[e.key as keyof typeof at];
    if (!where) return;
    e.preventDefault();
    setOpen(where);
  };

  const onMenuKey = (e: KeyboardEvent) => {
    const list = enabled();
    const index = list.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => list[(i + list.length) % list.length]?.focus();
    switch (e.key) {
      case 'ArrowDown':
        return (e.preventDefault(), go(index + 1));
      case 'ArrowUp':
        return (e.preventDefault(), go(index < 0 ? -1 : index - 1));
      case 'Home':
        return (e.preventDefault(), go(0));
      case 'End':
        return (e.preventDefault(), go(-1));
      case 'Escape':
        // Stops here, so a dialog holding the menu stays open.
        e.preventDefault();
        e.stopPropagation();
        return close(true);
      case 'Tab':
        return close(false);
      case 'Enter':
      case ' ':
        e.preventDefault();
        return (document.activeElement as HTMLElement).click();
    }
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLowerCase();
    const after = [...list.slice(index + 1), ...list.slice(0, index + 1)];
    after.find((el) => String(el.textContent).toLowerCase().startsWith(key))?.focus();
  };

  return (
    <div ref={wrapRef} className={cx('g-menu', className)}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className={triggerClassName ?? 'g-menu__trigger'}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={Boolean(open)}
        aria-controls={menuId}
        onClick={() => (open ? close(false) : setOpen('first'))}
        onKeyDown={onTriggerKey}
      >
        {trigger}
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={menuId}
          role="menu"
          tabIndex={-1}
          aria-labelledby={triggerId}
          className={cx('g-menu__panel', `g-menu__panel--${placement}`, `g-menu__panel--${align}`)}
          onKeyDown={onMenuKey}
        >
          {items.map((entry, i) =>
            'separator' in entry ? (
              <div key={i} role="separator" className="g-menu__separator" />
            ) : (
              <button
                key={i}
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-disabled={entry.disabled || undefined}
                className={cx('g-menu__item', entry.danger && 'g-menu__item--danger')}
                onClick={() => {
                  if (entry.disabled) return;
                  close(true);
                  entry.onSelect();
                }}
              >
                {entry.icon ? (
                  <span className="g-menu__icon" aria-hidden="true">
                    {entry.icon}
                  </span>
                ) : null}
                <span className="g-menu__label">{entry.label}</span>
                {entry.hint ? <span className="g-menu__hint">{entry.hint}</span> : null}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
