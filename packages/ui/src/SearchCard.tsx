import { useId, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Button } from './Button';
import { SearchIcon, XIcon } from './Icon';
import './search-card.css';

export interface SearchCardFilter {
  id: string;
  /** What the filter is, in words: "Level: Foundation". */
  label: string;
  onRemove: () => void;
}

export interface SearchCardProps {
  /** Names the search region, e.g. "Find a course". */
  label: string;
  search: {
    value: string;
    onChange: (value: string) => void;
    /** The field's accessible name, e.g. "Search courses". */
    label: string;
    placeholder?: string;
  };
  /** The main way to slice the list: a `SegmentedControl` of 2 to 4 views. */
  views?: ReactNode;
  /** Secondary filters: `Select`s with `hideLabel`. */
  filters?: ReactNode;
  /** Filters that are on, shown as removable chips under the field. */
  active?: SearchCardFilter[];
  /** What the search leaves, e.g. "3 of 12 courses". Announced politely when it changes. */
  count?: ReactNode;
  /** Clears the search and every filter. The button shows while anything is on. */
  onClear?: () => void;
  /** Default: "Clear all filters". */
  clearLabel?: string;
  /** Accessible name of the field's own clear button. Default: "Clear search". */
  clearSearchLabel?: string;
}

/**
 * Search and filters for a list, as one card: a large search field on top (icon, clear button, Esc
 * clears), the views and dropdowns under it, then the filters that are on as removable chips with
 * the live result count. Use it for a list people search (courses, media), not for a table's header.
 */
export function SearchCard({
  label,
  search,
  views,
  filters,
  active = [],
  count,
  onClear,
  clearLabel = 'Clear all filters',
  clearSearchLabel = 'Clear search',
}: SearchCardProps) {
  const field = useRef<HTMLInputElement>(null);
  const id = useId();
  const anyOn = search.value !== '' || active.length > 0;
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && search.value) {
      e.preventDefault();
      search.onChange('');
    }
  };
  return (
    <section className="g-search-card" role="search" aria-label={label}>
      <div className="g-search-card__field">
        <SearchIcon className="g-search-card__icon" size={20} />
        <input
          ref={field}
          id={id}
          type="search"
          className="g-search-card__input"
          aria-label={search.label}
          placeholder={search.placeholder ?? search.label}
          value={search.value}
          autoComplete="off"
          onChange={(e) => search.onChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {search.value ? (
          <button
            type="button"
            className="g-search-card__clear"
            aria-label={clearSearchLabel}
            onClick={() => {
              search.onChange('');
              field.current?.focus();
            }}
          >
            <XIcon />
          </button>
        ) : null}
      </div>
      {views || filters ? (
        <div className="g-search-card__tools">
          {views ? <div className="g-search-card__views">{views}</div> : null}
          {filters ? <div className="g-search-card__filters">{filters}</div> : null}
        </div>
      ) : null}
      <div className="g-search-card__status">
        {active.length > 0 ? (
          <ul className="g-search-card__active" aria-label="Filters on">
            {active.map((f) => (
              <li key={f.id} className="g-search-card__chip">
                {f.label}
                <button
                  type="button"
                  className="g-search-card__chip-x"
                  aria-label={`Remove filter: ${f.label}`}
                  onClick={f.onRemove}
                >
                  <XIcon size={12} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {anyOn && onClear ? (
          <Button variant="ghost" size="sm" onClick={onClear}>
            {clearLabel}
          </Button>
        ) : null}
        {count === undefined ? null : (
          <p className="g-search-card__count" role="status">
            {count}
          </p>
        )}
      </div>
    </section>
  );
}
