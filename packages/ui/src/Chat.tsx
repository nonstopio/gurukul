import { useEffect, useRef } from 'react';
import type { HTMLAttributes, LiHTMLAttributes, ReactNode, Ref } from 'react';
import { cx } from './cx';
import { InfoIcon, PaperclipIcon, SparkIcon, XIcon } from './Icon';
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

/** The end of a turn, between messages: its name and count, and what can be done with it. */
export function ChatTurn({ className, ...rest }: LiHTMLAttributes<HTMLLIElement>) {
  return <li className={cx('g-chat-turn', className)} {...rest} />;
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
