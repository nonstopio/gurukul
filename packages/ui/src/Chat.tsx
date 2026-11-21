import { useEffect, useId, useRef, useState } from 'react';
import type {
  ButtonHTMLAttributes,
  FormEvent,
  HTMLAttributes,
  KeyboardEvent,
  LiHTMLAttributes,
  ReactNode,
  Ref,
} from 'react';
import { cx } from './cx';
import {
  AlertIcon,
  CheckIcon,
  ChevronRightIcon,
  InfoIcon,
  PaperclipIcon,
  SparkIcon,
  XIcon,
} from './Icon';
import './chat.css';

/*
 * A conversation with an agent (Desktop Studio's session chat): the log, its messages, the line
 * between turns, and the live line that says what the agent is doing. Who said what is a word
 * ("You", "Agent"), never only a colour or a side of the screen.
 */

export interface ChatLogProps extends HTMLAttributes<HTMLDivElement> {
  /** The log's accessible name: "Chat with the agent". */
  label: string;
  /** The scrolling region, to keep the newest message in view. */
  ref?: Ref<HTMLDivElement> | undefined;
}

/**
 * The messages, oldest first: a `role="log"` region round an `<ol>`, so what is added is read out
 * politely and nothing already said is read again. Children are `ChatMessage`s and `ChatTurn`s.
 * The region is what a layout scrolls, when it gives the log a height.
 */
export function ChatLog({ label, className, children, ...rest }: ChatLogProps) {
  return (
    <div role="log" aria-label={label} className={cx('g-chat-log', className)} {...rest}>
      <ol className="g-chat-log__list">{children}</ol>
    </div>
  );
}

export type ChatMessageFrom = 'you' | 'agent' | 'notice';

export interface ChatMessageProps extends LiHTMLAttributes<HTMLLIElement> {
  /** `you` the person at the keyboard, `agent` the reply, `notice` something the app says. */
  from: ChatMessageFrom;
  /** Who said it, shown above it ("You", "Agent"). A notice has none: it leads with an icon. */
  author?: string;
  children: ReactNode;
}

/** One message. The person's own sit on a sunken ground; a notice is a quiet line with an icon. */
export function ChatMessage({ from, author, className, children, ...rest }: ChatMessageProps) {
  return (
    <li className={cx('g-chat-msg', `g-chat-msg--${from}`, className)} {...rest}>
      {from === 'notice' ? (
        <InfoIcon size={16} className="g-chat-msg__icon" />
      ) : (
        <p className="g-chat-msg__who">{author}</p>
      )}
      <div className="g-chat-msg__body">{children}</div>
    </li>
  );
}

/**
 * The end of a turn, after its reply: what it changed (`ChatChanges`), its footer
 * (`ChatTurnFooter`) and its check (`ChatCheck`), stacked.
 */
export function ChatTurn({ className, ...rest }: LiHTMLAttributes<HTMLLIElement>) {
  return <li className={cx('g-chat-turn', className)} {...rest} />;
}

export interface ChatTurnFooterProps extends HTMLAttributes<HTMLDivElement> {
  /** What can be done with the turn, at the end of the line: Go back to before this. */
  end?: ReactNode;
}

/** A turn's muted line, "Worked for 2m 39s, 19 changes", with its actions at the far end. */
export function ChatTurnFooter({ end, className, children, ...rest }: ChatTurnFooterProps) {
  return (
    <div className={cx('g-chat-turn__foot', className)} {...rest}>
      <p className="g-chat-turn__meta">{children}</p>
      {end ? <div className="g-chat-turn__end">{end}</div> : null}
    </div>
  );
}

export interface ChatCheckProps extends HTMLAttributes<HTMLParagraphElement> {
  /** True: the check passed (a tick). False: it found problems (an alert). Said in the words too. */
  ok: boolean;
}

/** "Checked: no new problems": a turn's check, as a tick or an alert and the words. */
export function ChatCheck({ ok, className, children, ...rest }: ChatCheckProps) {
  return (
    <p className={cx('g-chat-check', !ok && 'g-chat-check--problem', className)} {...rest}>
      {ok ? <CheckIcon size={14} /> : <AlertIcon size={14} />}
      <span>{children}</span>
    </p>
  );
}

export interface ChatStepsProps extends HTMLAttributes<HTMLDivElement> {
  /** The disclosure's words: "How it got there". */
  label: string;
  /** What the agent did, in plain words, in order. */
  steps: readonly string[];
}

/**
 * What the agent did on the way to a reply, folded away: a button with `aria-expanded` and a
 * chevron, and the steps in a list under it once opened. Closed to begin with, so the reply leads.
 */
export function ChatSteps({ label, steps, className, ...rest }: ChatStepsProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={cx('g-chat-steps', className)} {...rest}>
      <button
        type="button"
        className="g-chat-steps__button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <ChevronRightIcon size={14} />
        {label}
      </button>
      <ol id={id} className="g-chat-steps__list" hidden={!open}>
        {steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
    </div>
  );
}

/** One change in a turn's list: an icon for the kind of part, what was done, and when. */
export interface ChatChange {
  id: string;
  icon: ReactNode;
  /** "Edited Why rebase". */
  label: string;
  /** On the right: "2 min ago". */
  detail: string;
}

export interface ChatChangesProps extends Omit<HTMLAttributes<HTMLUListElement>, 'children'> {
  /** The list's accessible name: "What this turn changed". */
  label: string;
  items: readonly ChatChange[];
  /** How many show before "+N more". Default 6. */
  limit?: number;
}

/**
 * What a turn changed, one row each. Only the first `limit` show; the rest are one "+N more" pill
 * away, which becomes "Show fewer". Nothing is drawn when empty.
 */
export function ChatChanges({ label, items, limit = 6, className, ...rest }: ChatChangesProps) {
  const [all, setAll] = useState(false);
  if (items.length === 0) return null;
  const shown = all ? items : items.slice(0, limit);
  const more = items.length - limit;
  return (
    <ul aria-label={label} className={cx('g-chat-changes', className)} {...rest}>
      {shown.map((item) => (
        <li key={item.id} className="g-chat-change">
          {item.icon}
          <span className="g-chat-change__label">{item.label}</span>
          <span className="g-chat-change__detail">{item.detail}</span>
        </li>
      ))}
      {more > 0 ? (
        <li>
          <button
            type="button"
            className="g-chat-changes__more"
            aria-expanded={all}
            onClick={() => setAll(!all)}
          >
            {all ? 'Show fewer' : `+${more} more`}
          </button>
        </li>
      ) : null}
    </ul>
  );
}

export interface ChatActivityProps extends HTMLAttributes<HTMLParagraphElement> {
  /** What the agent is doing, in plain words. Nothing between turns: the line stays, empty. */
  children?: ReactNode;
}

/**
 * The live line under the log: "Rewriting a lesson". A `role="status"` that is always there, so a
 * new line is announced; it does not move or loop.
 */
export function ChatActivity({ children, className, ...rest }: ChatActivityProps) {
  const busy = children !== undefined && children !== null && children !== '';
  return (
    <p role="status" className={cx('g-chat-activity', className)} {...rest}>
      {busy ? (
        <>
          <SparkIcon size={16} />
          <span>{children}</span>
        </>
      ) : null}
    </p>
  );
}

/** One thing attached to a message: a stable id and what it is, in plain words. */
export interface ChatAttachment {
  id: string;
  /** "Lesson 3.2 · Text block 2". */
  label: string;
}

export interface ChatAttachmentsProps extends Omit<HTMLAttributes<HTMLUListElement>, 'children'> {
  /** The list's accessible name: "Attached to your next message". */
  label: string;
  items: readonly ChatAttachment[];
  /** Given, each chip has a remove button named "Remove {label}". Left out, the chips only say. */
  onRemove?: (id: string) => void;
  /** After the last chip is removed focus has nowhere left in the list: move it (the message box). */
  onEmptied?: () => void;
}

/**
 * What a message carries besides its words, as chips with a paperclip: above the message box with
 * remove buttons, or under a sent message to say what it carried. A removed chip hands focus to the
 * chip that takes its place, else the one before it, else `onEmptied`. Nothing is drawn when empty.
 */
export function ChatAttachments({
  label,
  items,
  onRemove,
  onEmptied,
  className,
  ...rest
}: ChatAttachmentsProps) {
  const list = useRef<HTMLUListElement>(null);
  /** Where the chip just removed was, until the list without it is drawn. */
  const removed = useRef<number | null>(null);

  useEffect(() => {
    const at = removed.current;
    if (at === null) return;
    removed.current = null;
    const buttons = list.current?.querySelectorAll('button') ?? [];
    const next = buttons[Math.min(at, buttons.length - 1)];
    if (next) next.focus();
    else onEmptied?.();
  }, [items, onEmptied]);

  if (items.length === 0) return null;
  return (
    <ul ref={list} aria-label={label} className={cx('g-chat-attachments', className)} {...rest}>
      {items.map((item, i) => (
        <li key={item.id} className="g-chat-attachment">
          <PaperclipIcon size={14} />
          <span className="g-chat-attachment__label">{item.label}</span>
          {onRemove ? (
            <button
              type="button"
              className="g-chat-attachment__x"
              aria-label={`Remove ${item.label}`}
              onClick={() => {
                removed.current = i;
                onRemove(item.id);
              }}
            >
              <XIcon size={12} />
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export type ChatRoundTone = 'plain' | 'primary';

/** The class of a round button in the message box, for a `Menu` trigger that must look like one. */
export const chatRoundClass = (tone: ChatRoundTone = 'plain', extra?: string): string =>
  cx('g-chat-round', `g-chat-round--${tone}`, extra);

export interface ChatRoundButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> {
  /** The accessible name: "Send", "Stop". */
  label: string;
  /** `primary` is the one filled button (Send, Stop). Default: `plain`. */
  tone?: ChatRoundTone;
  /** The icon, decorative. */
  children: ReactNode;
}

/** A round, icon-only button for the message box. Always named; a tooltip says the same. */
export function ChatRoundButton({
  label,
  tone = 'plain',
  className,
  type = 'button',
  children,
  ...rest
}: ChatRoundButtonProps) {
  return (
    <button
      type={type}
      className={chatRoundClass(tone, className)}
      aria-label={label}
      data-tip={label}
      {...rest}
    >
      {children}
    </button>
  );
}

export interface ChatComposerProps {
  /** The box's accessible name: "Ask for a change". */
  label: string;
  placeholder?: string;
  /** Read out with the box, never shown: how to send and start a new line. */
  hint: string;
  value: string;
  onChange: (value: string) => void;
  /** Enter, but not Shift and Enter, and not while an input method is composing, calls this. */
  onSend: () => void;
  maxLength?: number;
  /** Above the box's text, inside it: the attached parts. */
  children?: ReactNode;
  /** Bottom left, inside the box: a round "+" menu. */
  start?: ReactNode;
  /** Bottom right, inside the box: Send, or Stop while the agent works. */
  end?: ReactNode;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  className?: string;
  /** The text area, to move focus back to it. */
  ref?: Ref<HTMLTextAreaElement> | undefined;
}

/**
 * The message box of a chat: one rounded box holding the text area and, in a row under it, a start
 * slot (the "+") and an end slot (Send or Stop). The ring shows round the box when the text area is
 * focused. The text area grows to its text, to six lines, then scrolls.
 */
export function ChatComposer({
  label,
  placeholder,
  hint,
  value,
  onChange,
  onSend,
  maxLength,
  children,
  start,
  end,
  onSubmit,
  className,
  ref,
}: ChatComposerProps) {
  const hintId = useId();
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    onSend();
  };
  return (
    <form className={cx('g-chat-composer', className)} onSubmit={onSubmit}>
      {children}
      <textarea
        ref={ref}
        className="g-chat-composer__text"
        aria-label={label}
        aria-describedby={hintId}
        placeholder={placeholder}
        rows={2}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <span id={hintId} className="g-visually-hidden">
        {hint}
      </span>
      <div className="g-chat-composer__row">
        <div className="g-chat-composer__start">{start}</div>
        <div className="g-chat-composer__end">{end}</div>
      </div>
    </form>
  );
}
