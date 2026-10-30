// A multi-select combobox for people: type, pick, and the person becomes a chip while the text
// clears, the list closes and focus stays in the field. The caller owns the chosen people (`value`)
// and the source of matches (`search`), because only the caller knows who exists and how to ask
// for them. Only the newest search's answer is shown, so a slow early response never replaces the
// results for what is typed now.

import { Fragment, useId, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent, ReactNode } from 'react';
import { Avatar } from './Avatar';
import type { AvatarTone } from './Avatar';
import { cx } from './cx';
import { XIcon } from './Icon';
import './people-picker.css';

export interface Person {
  /** Lower-cased; identifies the person. */
  email: string;
  name?: string | undefined;
  /** Shown beside the email, e.g. "Educator". */
  role?: string | undefined;
  tone?: AvatarTone | undefined;
}

export interface PeoplePickerProps {
  /** Visible label of the field. */
  label: string;
  /** The people chosen so far. */
  value: Person[];
  onChange: (people: Person[]) => void;
  /** The people matching what is typed. Debounce and the minimum length are the caller's. */
  search: (query: string) => Promise<Person[]>;
  placeholder?: string;
  /** Accessible name of a chip's remove button. Default: "Remove {name or email}". */
  removeLabel?: (person: Person) => string;
}

const nameOf = (p: Person) => p.name || p.email;

/** `text` with the first case-insensitive match of `query` in a `<mark>`. */
function highlight(text: string, query: string): ReactNode {
  const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (at < 0) return text;
  return (
    <Fragment>
      {text.slice(0, at)}
      <mark className="g-people__mark">{text.slice(at, at + query.length)}</mark>
      {text.slice(at + query.length)}
    </Fragment>
  );
}

export function PeoplePicker({
  label,
  value,
  onChange,
  search,
  placeholder = 'Search name or email',
  removeLabel = (p) => `Remove ${nameOf(p)}`,
}: PeoplePickerProps) {
  const id = useId();
  const [text, setText] = useState('');
  const [found, setFound] = useState<Person[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const latest = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  const ask = async (query: string) => {
    const mine = ++latest.current;
    const rows = await search(query);
    if (mine !== latest.current) return;
    setFound(rows);
    setActive(0);
    setOpen(true);
  };

  const close = () => {
    latest.current++;
    setOpen(false);
  };

  const pick = (person: Person) => {
    if (!value.some((v) => v.email === person.email)) onChange([...value, person]);
    setText('');
    close();
    input.current?.focus();
  };

  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
    void ask(e.target.value);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) void ask(text);
      else setActive((active + 1) % Math.max(found.length, 1));
    } else if (e.key === 'ArrowUp' && open) {
      e.preventDefault();
      setActive((active - 1 + found.length) % Math.max(found.length, 1));
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      const person = found[active];
      if (person) pick(person);
    } else if (e.key === 'Escape' && open) {
      // Closes the list only; a dialog around the field stays open.
      e.stopPropagation();
      close();
    } else if (e.key === 'Backspace' && text === '' && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const query = text.trim();
  const listId = `${id}-list`;
  const optionId = (n: number) => `${id}-option-${n}`;
  const count = `${found.length} ${found.length === 1 ? 'person matches' : 'people match'}`;

  return (
    <div className="g-people">
      <label className="g-people__label" htmlFor={`${id}-input`}>
        {label}
      </label>
      <div className="g-people__box">
        {value.length ? (
          <ul className="g-people__chips" aria-label={`${label}: added people`}>
            {value.map((p) => (
              <li key={p.email} className="g-people__chip">
                <span>{nameOf(p)}</span>
                <button
                  type="button"
                  className="g-people__remove"
                  aria-label={removeLabel(p)}
                  onClick={() => {
                    onChange(value.filter((v) => v.email !== p.email));
                    input.current?.focus();
                  }}
                >
                  <XIcon size={12} strokeWidth={2} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <input
          ref={input}
          id={`${id}-input`}
          className="g-people__input"
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          {...(open && found.length ? { 'aria-activedescendant': optionId(active) } : {})}
          autoComplete="off"
          spellCheck={false}
          placeholder={value.length ? undefined : placeholder}
          value={text}
          onChange={onInput}
          onKeyDown={onKeyDown}
          onBlur={close}
        />
      </div>
      <div
        id={listId}
        className="g-people__list"
        role="listbox"
        aria-multiselectable="true"
        aria-label={`${label}: matches`}
        hidden={!open}
      >
        {found.map((p, n) => {
          const added = value.some((v) => v.email === p.email);
          return (
            <div
              key={p.email}
              id={optionId(n)}
              role="option"
              tabIndex={-1}
              aria-selected={added}
              className={cx('g-people__option', n === active && 'g-people__option--active')}
              // On press, not click: preventing it keeps focus in the field, so the blur that
              // closes the list never runs before the pick.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
            >
              <Avatar name={nameOf(p)} tone={p.tone} size={34} />
              <span className="g-people__who">
                <strong>{highlight(nameOf(p), query)}</strong>
                <span className="g-people__meta">
                  {highlight(p.email, query)}
                  {p.role ? ` · ${p.role}` : ''}
                </span>
              </span>
              {added ? <span className="g-people__added">Added</span> : null}
            </div>
          );
        })}
        {open && found.length === 0 ? (
          <p className="g-people__empty">
            {query ? `No one matches “${query}”` : 'Type a name or email'}
          </p>
        ) : null}
      </div>
      <p className="g-people__live" role="status">
        {open ? count : ''}
      </p>
    </div>
  );
}
