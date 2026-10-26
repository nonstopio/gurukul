// A command palette: one combobox (the input) that owns a listbox of results through
// aria-activedescendant, so focus never leaves the input. Typing, arrows and Enter all happen in
// one place. What to search and what selecting means belong to the caller.

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import './command-palette.css';

export interface PaletteItem {
  id: string;
  label: string;
  /** Second line: where the result lives, what it is. */
  sub?: string;
  /** A short type label shown on the right ("Page", "Course"). */
  kind?: string;
}

export interface CommandPaletteProps<T extends PaletteItem> {
  open: boolean;
  onClose: () => void;
  /** Called on every keystroke; must be fast and synchronous. */
  search: (query: string) => T[];
  onSelect: (item: T) => void;
  /** Accessible name of the dialog and the input. */
  label: string;
  placeholder?: string;
  /** Shown before the quoted query when nothing matches. */
  emptyText?: string;
  /** Rows drawn before a "Show N more" option. */
  pageSize?: number;
}

export function CommandPalette<T extends PaletteItem>({ open, ...rest }: CommandPaletteProps<T>) {
  if (!open) return null;
  return createPortal(<PaletteDialog {...rest} />, document.body);
}

function PaletteDialog<T extends PaletteItem>({
  onClose,
  search,
  onSelect,
  label,
  placeholder = 'Search…',
  emptyText = 'Nothing matches',
  pageSize = 20,
}: Omit<CommandPaletteProps<T>, 'open'>) {
  const uid = useId();
  const listId = `${uid}-list`;
  const optId = (i: number) => `${uid}-opt-${i}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const [limit, setLimit] = useState(pageSize);

  // Focus the input on open; put focus back where it was on close.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => before?.focus?.();
  }, []);

  const results = useMemo(() => search(query), [search, query]);
  const shown = results.slice(0, limit);
  const more = results.length - shown.length;
  const optionCount = shown.length + (more > 0 ? 1 : 0);
  // Clamped on read, so a shrinking result list can never leave the selection past the end.
  const active = optionCount ? Math.min(sel, optionCount - 1) : -1;

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${active}"]`)
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  // Options are focusable only so assistive tech can reach them; a click must not steal focus
  // from the combobox, which drives the keyboard.
  const keepFocusInInput = (e: MouseEvent) => e.preventDefault();

  const activate = (i: number) => {
    if (i === shown.length) {
      setLimit(Infinity);
      return;
    }
    onSelect(shown[i] as T);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    // Focus stays on the input: there is nothing else in the dialog to tab to.
    if (e.key === 'Tab') {
      e.preventDefault();
      return;
    }
    // An IME is composing (Japanese, Chinese…): Enter commits the composition, not a result.
    if (e.nativeEvent.isComposing || !optionCount) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel(Math.min(active + 1, optionCount - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel(Math.max(active - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      activate(active);
    }
  };

  return (
    <div className="g-cmdk-layer">
      <button
        type="button"
        className="g-cmdk-backdrop"
        aria-label={`Close ${label.toLowerCase()}`}
        tabIndex={-1}
        onClick={onClose}
      />
      <div className="g-cmdk" role="dialog" aria-modal="true" aria-label={label}>
        <div className="g-cmdk__input">
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded={optionCount > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? optId(active) : undefined}
            aria-label={label}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSel(0);
              setLimit(pageSize);
            }}
            onKeyDown={onKeyDown}
          />
          <kbd>Esc</kbd>
        </div>

        <div className="g-cmdk__list" role="listbox" id={listId} aria-label="Results" ref={listRef}>
          {shown.map((item, i) => (
            // Keyboard is handled by the combobox above through aria-activedescendant.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <div
              key={item.id}
              id={optId(i)}
              data-idx={i}
              role="option"
              tabIndex={-1}
              aria-selected={i === active}
              className="g-cmdk__option"
              onMouseDown={keepFocusInInput}
              onMouseMove={() => setSel(i)}
              onClick={() => activate(i)}
            >
              <span className="g-cmdk__text">
                <span className="g-cmdk__label">{item.label}</span>
                {item.sub ? <span className="g-cmdk__sub">{item.sub}</span> : null}
              </span>
              {item.kind ? <span className="g-cmdk__kind">{item.kind}</span> : null}
            </div>
          ))}
          {more > 0 ? (
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <div
              id={optId(shown.length)}
              data-idx={shown.length}
              role="option"
              tabIndex={-1}
              aria-selected={active === shown.length}
              className="g-cmdk__option g-cmdk__more"
              onMouseDown={keepFocusInInput}
              onMouseMove={() => setSel(shown.length)}
              onClick={() => activate(shown.length)}
            >
              Show {more} more result{more === 1 ? '' : 's'}
            </div>
          ) : null}
        </div>

        {results.length === 0 ? (
          <p className="g-cmdk__empty">
            {emptyText} &ldquo;{query.trim()}&rdquo;.
          </p>
        ) : null}
        <p className="g-cmdk__sr" role="status" aria-live="polite">
          {query.trim() ? `${results.length} result${results.length === 1 ? '' : 's'}` : ''}
        </p>
        <div className="g-cmdk__foot" aria-hidden="true">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> move
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
          <span>
            <kbd>Esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
