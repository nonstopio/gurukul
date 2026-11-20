import { createContext, useContext, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { cx } from './cx';
import {
  AlertIcon,
  ChevronDownIcon,
  EmbedIcon,
  FileIcon,
  ImageIcon,
  PenIcon,
  PlayIcon,
  PlusIcon,
  SwapIcon,
  TrashIcon,
} from './Icon';
import './diff.css';

/*
 * The parts of a difference between two versions of the same thing, as Review shows them
 * (`.plan/22-desktop-studio.md`, How each kind of content is compared): words struck through or
 * underlined, code lines with − and + in the gutter, values as before → after, two columns or one,
 * and runs of unchanged entries folded away. Every mark has a sign or a text decoration and words
 * for a screen reader ("removed: …", "added: …"); colour only repeats what they say.
 */

/** One run of a text difference. Same shape as `DiffPart` in `@gurukul/schema/changes`. */
export interface DiffTextPart {
  op: 'same' | 'added' | 'removed';
  text: string;
}

/** Which side of a difference to draw: the text before, after, or both in one (inline). */
export type DiffSide = 'before' | 'after' | 'both';

const keeps = (side: DiffSide) => (part: DiffTextPart) =>
  side === 'both' || part.op === 'same' || (side === 'before') === (part.op === 'removed');

export interface DiffTextProps {
  parts: readonly DiffTextPart[];
  /** Default `both`: removed and added runs side by side in one text. */
  side?: DiffSide;
  className?: string;
}

/**
 * A word difference: removed words struck through on `--danger-soft`, added words underlined on
 * `--accent-soft`, each run led by hidden words ("removed: ", "added: ") for a screen reader. A run
 * of spaces alone is not marked.
 */
export function DiffText({ parts, side = 'both', className }: DiffTextProps) {
  return (
    <span className={cx('g-diff-text', className)}>
      {parts.filter(keeps(side)).map((part, i) => {
        if (part.op === 'same' || part.text.trim() === '') return part.text;
        const Tag = part.op === 'removed' ? 'del' : 'ins';
        return (
          <Tag key={i} className={`g-diff-text__${part.op}`}>
            <span className="g-visually-hidden">{`${part.op}: `}</span>
            {part.text}
          </Tag>
        );
      })}
    </span>
  );
}

export interface DiffCodeProps {
  /** A line difference: each part one or more whole lines. */
  parts: readonly DiffTextPart[];
  side?: DiffSide;
  /** Names the code for a screen reader, uniquely on the page: "Code block 4: Code, before". */
  label: string;
  className?: string;
}

const SIGN = { same: ' ', added: '+', removed: '−' } as const;

/** The lines of a part; the line break that ends the last one opens no new line. */
const linesOf = (text: string) => {
  const lines = text.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
};

/**
 * A line difference for code, in the monospace face: a gutter with − for a removed line and + for
 * an added one (hidden from a screen reader, which hears "removed line: " and "added line: "
 * instead), each changed line on its soft ground. Long lines scroll inside the block.
 */
export function DiffCode({ parts, side = 'both', label, className }: DiffCodeProps) {
  const lines = parts
    .filter(keeps(side))
    .flatMap((part) => linesOf(part.text).map((text) => ({ op: part.op, text })));
  // A scrollable region must take focus so a keyboard can scroll it (axe: scrollable-region-focusable),
  // as `CodeBlock` does.
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
    <div className={cx('g-diff-code', className)} role="region" aria-label={label} tabIndex={0}>
      <pre className="g-diff-code__pre">
        <code>
          {lines.map((line, i) => (
            <span key={i} className={`g-diff-code__line g-diff-code__line--${line.op}`}>
              <span className="g-diff-code__sign" aria-hidden="true">
                {SIGN[line.op]}
              </span>
              {line.op === 'same' ? null : (
                <span className="g-visually-hidden">{`${line.op} line: `}</span>
              )}
              {line.text === '' ? ' ' : line.text}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

/** A field as before → after, or as one difference already drawn (`change`). */
export type DiffFieldItem =
  | { label: string; before: ReactNode | null; after: ReactNode | null }
  | { label: string; change: ReactNode };

export interface DiffFieldsProps {
  items: readonly DiffFieldItem[];
  className?: string;
}

/**
 * Settings and fields that changed, one per line: "Pass mark 70% → 80%". The arrow is hidden from a
 * screen reader, which hears "changed to"; a value that is not set reads "Not set". A text field
 * passes its word difference as `change`.
 */
export function DiffFields({ items, className }: DiffFieldsProps) {
  const value = (v: ReactNode | null) =>
    v === null ? <span className="g-diff-fields__unset">Not set</span> : v;
  return (
    <dl className={cx('g-diff-fields', className)}>
      {items.map((item) => (
        <div key={item.label} className="g-diff-fields__row">
          <dt>{item.label}</dt>
          <dd>
            {'change' in item ? (
              item.change
            ) : (
              <>
                {value(item.before)}
                <span className="g-diff-fields__arrow" aria-hidden="true">
                  →
                </span>
                <span className="g-visually-hidden"> changed to </span>
                {value(item.after)}
              </>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** What happened to an entry. `renamed` is a chapter whose title changed. */
export type DiffStatus = 'added' | 'changed' | 'moved' | 'removed' | 'renamed';

const WORD: Record<DiffStatus, string> = {
  added: 'Added',
  changed: 'Changed',
  moved: 'Moved',
  removed: 'Removed',
  renamed: 'Renamed',
};

const STATUS_SIGN: Record<DiffStatus, ReactNode> = {
  added: <PlusIcon size={14} />,
  changed: <PenIcon size={14} />,
  moved: <SwapIcon size={14} />,
  removed: <TrashIcon size={14} />,
  renamed: <PenIcon size={14} />,
};

type DiffLayout = 'split' | 'inline';

const LayoutContext = createContext<DiffLayout>('inline');

export interface DiffViewProps {
  /** `split`: before on the left, after on the right (from 1024px). `inline`: one column. */
  layout: DiffLayout;
  /** Names the comparison: "Lesson 3.2, before and after". */
  label: string;
  children: ReactNode;
  className?: string;
}

/**
 * A comparison of two versions, entry by entry (`DiffRow`, `DiffUnchanged`). Side by side, a head
 * names the two columns; inline, each entry says which part is which.
 */
export function DiffView({ layout, label, children, className }: DiffViewProps) {
  return (
    <LayoutContext.Provider value={layout}>
      <div role="group" aria-label={label} className={cx('g-diff', `g-diff--${layout}`, className)}>
        {layout === 'split' ? (
          <div className="g-diff__head" aria-hidden="true">
            <span>Before</span>
            <span>After</span>
          </div>
        ) : null}
        {children}
      </div>
    </LayoutContext.Provider>
  );
}

export interface DiffRowProps {
  /** What happened, if anything: the first sets the tone. Empty for an unchanged entry. */
  statuses?: readonly DiffStatus[];
  /** What it is, in words: "Text block", "Question 2". */
  what: string;
  /** The entry before; null when it was added. */
  before: ReactNode | null;
  /** The entry after; null when it was removed. */
  after: ReactNode | null;
  /** Inline, the difference in one piece (a word difference); without it, before above after. */
  merged?: ReactNode;
  /** Lines that must be read on their own, such as a changed correct answer (`DiffNote`). */
  notes?: ReactNode;
  /**
   * The same on both sides (unchanged, or only moved): drawn once, as it is after, across both
   * columns, so nothing is announced twice.
   */
  same?: boolean;
  className?: string;
}

/**
 * One entry of a comparison: a label with a sign and the words for what happened, then the entry
 * before and after, in two columns or one under the other. A side with nothing says so in words
 * ("Not there before", "Removed").
 */
export function DiffRow({
  statuses = [],
  what,
  before,
  after,
  merged,
  notes,
  same = false,
  className,
}: DiffRowProps) {
  const layout = useContext(LayoutContext);
  const [first] = statuses;
  const words = statuses.map((s) => WORD[s]);
  const name = first ? `${words.join(' and ').toLowerCase()}: ${what}` : what;
  const cell = (side: 'before' | 'after', content: ReactNode | null, labelled: boolean) => (
    <div className={`g-diff-row__cell g-diff-row__cell--${side}`}>
      {labelled ? (
        <p className="g-diff-row__side">{side === 'before' ? 'Before' : 'After'}</p>
      ) : (
        <span className="g-visually-hidden">{side === 'before' ? 'Before: ' : 'After: '}</span>
      )}
      {content ?? (
        <p className="g-diff-row__none">{side === 'before' ? 'Not there before' : 'Removed'}</p>
      )}
    </div>
  );
  let body: ReactNode;
  if (same) {
    body = <div className="g-diff-row__merged">{after}</div>;
  } else if (layout === 'split') {
    body = (
      <div className="g-diff-row__cells">
        {cell('before', before, false)}
        {cell('after', after, false)}
      </div>
    );
  } else if (merged !== undefined) {
    body = <div className="g-diff-row__merged">{merged}</div>;
  } else {
    body = (
      <div className="g-diff-row__stack">
        {before === null ? null : cell('before', before, true)}
        {after === null ? null : cell('after', after, true)}
      </div>
    );
  }
  return (
    <section
      role="group"
      aria-label={name}
      className={cx('g-diff-row', first && `g-diff-row--${first}`, className)}
    >
      <p className="g-diff-row__label" aria-hidden="true">
        {first ? STATUS_SIGN[first] : null}
        <span>{first ? `${words.join(' · ')} · ${what}` : what}</span>
      </p>
      {notes}
      {body}
    </section>
  );
}

export interface DiffUnchangedProps {
  /** What is folded away, counted: "3 unchanged blocks". */
  label: string;
  /** The unchanged entries, drawn only once opened. */
  children: ReactNode;
  /** Open at first. Default: false. */
  defaultOpen?: boolean;
}

/** A run of unchanged entries folded into one line that opens them ("3 unchanged blocks"). */
export function DiffUnchanged({ label, children, defaultOpen = false }: DiffUnchangedProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className="g-diff-unchanged">
      <button
        type="button"
        className="g-diff-unchanged__toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronDownIcon size={16} className="g-diff-unchanged__chevron" />
        {label}
      </button>
      <div id={id} className="g-diff-unchanged__body" hidden={!open}>
        {open ? children : null}
      </div>
    </div>
  );
}

export interface DiffNoteProps {
  children: ReactNode;
  className?: string;
}

/**
 * A line that must not be folded into "changed", in the warning tone with its sign: "Correct
 * answer changed: B → C".
 */
export function DiffNote({ children, className }: DiffNoteProps) {
  return (
    <p className={cx('g-diff-note', className)}>
      <AlertIcon size={16} className="g-diff-note__icon" />
      <span>{children}</span>
    </p>
  );
}

export type DiffMediaKind = 'image' | 'video' | 'embed' | 'file';

export interface DiffMediaProps {
  kind: DiffMediaKind;
  /** The address; an empty one says "No address". */
  url: string;
  /** Its name in words: a caption, a title, a file label, or the block's kind. */
  name: string;
  /** An image's alt text; empty means decorative. */
  alt?: string;
  className?: string;
}

const MEDIA_ICON: Record<Exclude<DiffMediaKind, 'image'>, ReactNode> = {
  video: <PlayIcon size={20} />,
  embed: <EmbedIcon size={20} />,
  file: <FileIcon size={20} />,
};

/** The host of an address, for a link card; the address itself when it has none. */
const hostOf = (url: string) => {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
};

/**
 * A media block in a comparison: an image as a thumbnail, anything else as a link card (icon, name,
 * host) that opens in a new window. The fields that changed go beside it in `DiffFields`.
 */
export function DiffMedia({ kind, url, name, alt = '', className }: DiffMediaProps) {
  if (url === '') {
    return (
      <p className={cx('g-diff-media', 'g-diff-media--empty', className)}>
        {kind === 'image' ? <ImageIcon size={20} /> : MEDIA_ICON[kind]}
        <span>{`${name} · No address`}</span>
      </p>
    );
  }
  if (kind === 'image') {
    return (
      <figure className={cx('g-diff-media', 'g-diff-media--image', className)}>
        <img src={url} alt={alt} loading="lazy" />
        <figcaption>{name}</figcaption>
      </figure>
    );
  }
  return (
    <a
      className={cx('g-diff-media', 'g-diff-media--link', className)}
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label={`${name} · ${hostOf(url)} (opens in a new window)`}
    >
      {MEDIA_ICON[kind]}
      <span className="g-diff-media__text">
        <span className="g-diff-media__name">{name}</span>
        <span className="g-diff-media__host">{hostOf(url)}</span>
      </span>
    </a>
  );
}
