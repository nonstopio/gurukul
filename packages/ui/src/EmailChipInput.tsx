// A text input that turns emails into removable chips. The caller owns the list (`value`) and says
// what each email means (`classify`), because only the caller knows who has signed in or already
// has the course. Every chip states its status in words, so colour is never the only signal.

import { useId, useState } from 'react';
import type { ChangeEvent, ClipboardEvent, KeyboardEvent } from 'react';
import { cx } from './cx';
import { XIcon } from './Icon';
import './email-chip-input.css';

export type EmailStatus = 'signedIn' | 'new' | 'alreadyAssigned' | 'rejected';

export interface EmailClassification {
  status: EmailStatus;
  /** Why an email was rejected; shown on the chip. */
  reason?: string;
}

export interface EmailChipInputProps {
  /** Visible label of the field. */
  label: string;
  /** The emails, lower-cased and without duplicates. */
  value: string[];
  onChange: (emails: string[]) => void;
  /** Decides each chip's status. Called on every render for every chip, so keep it cheap. */
  classify: (email: string) => EmailClassification;
  placeholder?: string;
  /** Id of the element that explains the chips (the caller's legend). */
  describedBy?: string;
  /** Accessible name of a chip's remove button. Default: "Remove {email}". */
  removeLabel?: (email: string) => string;
}

const SEPARATORS = /[\s,;]+/;

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

export function EmailChipInput({
  label,
  value,
  onChange,
  classify,
  placeholder = 'name@nonstopio.com',
  describedBy,
  removeLabel = (email) => `Remove ${email}`,
}: EmailChipInputProps) {
  const id = useId();
  const [text, setText] = useState('');

  const add = (emails: string[]) => {
    const fresh = emails.filter((e, i) => !value.includes(e) && emails.indexOf(e) === i);
    if (fresh.length) onChange([...value, ...fresh]);
  };
  const flush = () => {
    add(splitEmails(text));
    setText('');
  };

  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    if (!SEPARATORS.test(next)) {
      setText(next);
      return;
    }
    // A separator was typed: everything before it is complete, the tail is still being typed.
    const parts = next.split(SEPARATORS);
    const tail = parts.pop() as string;
    add(parts.map((p) => p.trim().toLowerCase()).filter(Boolean));
    setText(tail);
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    add(splitEmails(text + e.clipboardData.getData('text')));
    setText('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && text.trim()) {
      e.preventDefault();
      flush();
    } else if (e.key === 'Backspace' && text === '' && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="g-emails">
      <label className="g-emails__label" htmlFor={`${id}-input`}>
        {label}
      </label>
      <div className="g-emails__box">
        {value.length ? (
          <ul className="g-emails__chips" aria-label={`${label}: added emails`}>
            {value.map((email) => {
              const { status, reason } = classify(email);
              const words =
                status === 'rejected' ? (reason ?? STATUS_WORDS.rejected) : STATUS_WORDS[status];
              return (
                <li key={email} className={cx('g-emails__chip', `g-emails__chip--${status}`)}>
                  <span className="g-emails__addr">{email}</span>
                  <span className="g-emails__status">
                    <span aria-hidden="true">· </span>
                    {words}
                  </span>
                  <button
                    type="button"
                    className="g-emails__remove"
                    aria-label={removeLabel(email)}
                    onClick={() => onChange(value.filter((v) => v !== email))}
                  >
                    <XIcon size={12} strokeWidth={2} />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        <input
          id={`${id}-input`}
          className="g-emails__input"
          type="text"
          inputMode="email"
          autoComplete="off"
          spellCheck={false}
          placeholder={value.length ? undefined : placeholder}
          aria-describedby={describedBy}
          value={text}
          onChange={onInput}
          onPaste={onPaste}
          onKeyDown={onKeyDown}
          onBlur={flush}
        />
      </div>
    </div>
  );
}
