// The one way to pick people: a Jira-style typeahead. Focus it and the first people show; type and
// the list narrows to name and email matches, each with a photo; click one (or press Enter) and the
// person becomes a chip while the text clears, the list closes and focus stays in the field. With
// `allowEmails`, an email typed or pasted becomes a chip too, for someone who has not signed in
// yet. The caller owns the chosen people (`value`) and the source of matches (`search`), because
// only the caller knows who exists and how to ask for them. Only the newest search's answer is
// shown, so a slow early response never replaces the results for what is typed now.

import { Fragment, useId, useRef, useState } from 'react';
import type { ChangeEvent, ClipboardEvent, KeyboardEvent, ReactNode } from 'react';
import { Avatar } from './Avatar';
import type { AvatarTone } from './Avatar';
import { cx } from './cx';
import { XIcon } from './Icon';
import './people-picker.css';

export type EmailStatus = 'signedIn' | 'new' | 'alreadyAssigned' | 'rejected';

export interface EmailClassification {
  status: EmailStatus;
  /** Why an email was rejected; shown on the chip. */
  reason?: string;
}

export interface Person {
  /** Lower-cased; identifies the person. */
  email: string;
  name?: string | undefined;
  /** Their photo (the Google picture); the initials show when there is none or it fails. */
  photoUrl?: string | null | undefined;
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
  /** The people matching what is typed; `''` is asked when the field gets focus. Debounce and the minimum length are the caller's. */
  search: (query: string) => Promise<Person[]>;
  placeholder?: string | undefined;
  /** Accessible name of a chip's remove button. Default: "Remove {name or email}". */
  removeLabel?: (person: Person) => string;
  /** An email typed or pasted becomes a chip, and a typed email with no match is offered as "Add". */
  allowEmails?: boolean;
  /** Says in words what a chip means (signed in, new, already has it, rejected); `null` says nothing. */
  classify?: ((email: string) => EmailClassification | null) | undefined;
  /** The words a status shows on its chip, where the default does not fit ("new" → "Invited"). */
  statusWords?: Partial<Record<EmailStatus, string>> | undefined;
  /** How many people there are in all, for "Showing 10 of 42 people" under the first list. */
  total?: number | undefined;
  /** Id of the element that explains the chips. */
  describedBy?: string | undefined;
}

const SEPARATORS = /[\s,;]+/;
const LOOKS_LIKE_EMAIL = /^\S+@\S+$/;

/** Splits pasted or typed text into lower-cased emails, dropping empty pieces. */
export function splitEmails(text: string): string[] {
  return text
    .split(SEPARATORS)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const STATUS_WORDS: Record<EmailStatus, string> = {
  signedIn: 'signed in',
  new: 'new',
  alreadyAssigned: 'already assigned',
  rejected: 'rejected',
};

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
  allowEmails = false,
  classify,
  statusWords,
  total,
  describedBy,
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

  const has = (email: string, list = value) => list.some((v) => v.email === email);

  const pick = (person: Person) => {
    if (!has(person.email)) onChange([...value, person]);
    setText('');
    close();
    input.current?.focus();
  };

  const addEmails = (emails: string[]) => {
    const fresh = emails.filter((e, i) => !has(e) && emails.indexOf(e) === i);
    if (fresh.length) onChange([...value, ...fresh.map((email) => ({ email }))]);
  };

  const query = text.trim();
  const typedEmail = query.toLowerCase();
  // A typed email that nobody in the list has is offered last, as someone to invite.
  const offer =
    allowEmails && LOOKS_LIKE_EMAIL.test(query) && !found.some((p) => p.email === typedEmail);
  const options: Array<Person & { offer?: boolean }> = offer
    ? [...found, { email: typedEmail, offer: true }]
    : found;

  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    // "ravi@x.com " or "a@x.com, b@x.com": what is complete becomes chips, the tail stays typed.
    if (allowEmails && /[,;\n]|^\S+@\S+\s/.test(next)) {
      const parts = next.split(SEPARATORS);
      const tail = parts.pop() as string;
      addEmails(parts.map((p) => p.trim().toLowerCase()).filter(Boolean));
      setText(tail);
      void ask(tail);
      return;
    }
    setText(next);
    void ask(next);
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    if (!allowEmails) return;
    const pieces = splitEmails(text + e.clipboardData.getData('text'));
    // A pasted list of emails is taken whole; anything else pastes as text, into the search.
    if (pieces.length === 0 || !pieces.every((p) => p.includes('@'))) return;
    e.preventDefault();
    addEmails(pieces);
    setText('');
    close();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) void ask(text);
      else setActive((active + 1) % Math.max(options.length, 1));
    } else if (e.key === 'ArrowUp' && open) {
      e.preventDefault();
      setActive((active - 1 + options.length) % Math.max(options.length, 1));
    } else if (e.key === 'Enter' && (open || (allowEmails && query))) {
      e.preventDefault();
      const person = open ? options[active] : undefined;
      if (person) pick(stripOffer(person));
      else if (allowEmails && query) {
        addEmails(splitEmails(text));
        setText('');
        close();
      }
    } else if (e.key === 'Escape' && open) {
      // Closes the list only; a dialog around the field stays open.
      e.stopPropagation();
      close();
    } else if (e.key === 'Backspace' && text === '' && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const onBlur = () => {
    close();
    // An email left in the field when it loses focus is kept, not lost.
    if (allowEmails && text.includes('@')) {
      addEmails(splitEmails(text));
      setText('');
    }
  };

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
            {value.map((p) => {
              const said = classify?.(p.email) ?? null;
              const words = said
                ? said.status === 'rejected'
                  ? (said.reason ?? statusWords?.rejected ?? STATUS_WORDS.rejected)
                  : (statusWords?.[said.status] ?? STATUS_WORDS[said.status])
                : null;
              return (
                <li
                  key={p.email}
                  className={cx('g-people__chip', said && `g-people__chip--${said.status}`)}
                >
                  <Avatar name={nameOf(p)} tone={p.tone} photoUrl={p.photoUrl} size={24} />
                  <span>{nameOf(p)}</span>
                  {words ? (
                    <span className="g-people__status">
                      <span aria-hidden="true">· </span>
                      {words}
                    </span>
                  ) : null}
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
              );
            })}
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
          aria-describedby={describedBy}
          {...(open && options.length ? { 'aria-activedescendant': optionId(active) } : {})}
          autoComplete="off"
          spellCheck={false}
          placeholder={value.length ? undefined : placeholder}
          value={text}
          onChange={onInput}
          onPaste={onPaste}
          onKeyDown={onKeyDown}
          onFocus={() => void ask(text)}
          onBlur={onBlur}
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
        {options.map((p, n) => {
          const added = has(p.email);
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
                pick(stripOffer(p));
              }}
            >
              <Avatar name={nameOf(p)} tone={p.tone} photoUrl={p.photoUrl} size={34} />
              <span className="g-people__who">
                <strong>{p.offer ? `Add “${p.email}”` : highlight(nameOf(p), query)}</strong>
                <span className="g-people__meta">
                  {p.offer ? (
                    'Not signed in yet: they are invited'
                  ) : (
                    <>
                      {highlight(p.email, query)}
                      {p.role ? ` · ${p.role}` : ''}
                    </>
                  )}
                </span>
              </span>
              {added ? <span className="g-people__added">Added</span> : null}
            </div>
          );
        })}
        {open && options.length === 0 ? (
          <p className="g-people__empty">
            {query
              ? `No one matches “${query}”`
              : allowEmails
                ? 'Type a name or an email'
                : 'Type a name or email'}
          </p>
        ) : null}
        {open && !query && total !== undefined && found.length > 0 ? (
          <p className="g-people__footer">{`Showing ${found.length} of ${total} ${total === 1 ? 'person' : 'people'}`}</p>
        ) : null}
      </div>
      <p className="g-people__live" role="status">
        {open ? count : ''}
      </p>
    </div>
  );
}

/** The person without the marker that says the row was an offer to add a typed email. */
function stripOffer({ email, name, photoUrl, role, tone }: Person & { offer?: boolean }): Person {
  return { email, name, photoUrl, role, tone };
}
