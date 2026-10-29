import { useEffect, useRef, useState } from 'react';
import type { HTMLAttributes } from 'react';
import { cx } from './cx';
import './code-block.css';

export interface CodeBlockProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** The code to show and copy. A single trailing newline is dropped. */
  code: string;
  /** Shown in the header. Without one the header says "terminal" for `terminal`, else "code". */
  fileName?: string;
  /** `terminal` prefixes each line with a prompt that is not copied. Default: `code`. */
  variant?: 'code' | 'terminal';
  /** Lines to highlight, 1-based: `"2,4-6"`. Anything that is not a number or range is ignored. */
  highlight?: string;
  /** Show the Copy button. Default: true. */
  copyable?: boolean;
  /** Copy button text. Default: "Copy". */
  copyLabel?: string;
  /** Copy button text for two seconds after a copy. Default: "Copied". */
  copiedLabel?: string;
  /** Announced when the clipboard refuses. Default: "Could not copy". */
  failedLabel?: string;
}

/** How long the button says "Copied". */
const COPIED_MS = 2000;

/** Turns `"2,4-6"` into the set of line numbers `{2, 4, 5, 6}`. Bad tokens are skipped. */
export function parseHighlight(spec: string | undefined): Set<number> {
  const lines = new Set<number>();
  for (const token of (spec ?? '').split(',')) {
    const match = /^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(token);
    if (!match) continue;
    const from = Number(match[1]);
    const to = match[2] === undefined ? from : Number(match[2]);
    for (let n = Math.min(from, to); n <= Math.max(from, to); n++) lines.add(n);
  }
  return lines;
}

function Icon({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

const COPY_ICON = 'M5.5 5.5h7v8h-7zM3.5 10.5v-8h7';
const CHECK_ICON = 'M3 8.5l3.5 3.5L13 4.5';

/** A code listing with a header, a Copy button and optional highlighted lines. */
export function CodeBlock({
  code,
  fileName,
  variant = 'code',
  highlight,
  copyable = true,
  copyLabel = 'Copy',
  copiedLabel = 'Copied',
  failedLabel = 'Could not copy',
  className,
  ...rest
}: CodeBlockProps) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const terminal = variant === 'terminal';
  const name = fileName ?? (terminal ? 'terminal' : 'code');
  const marked = parseHighlight(highlight);
  const lines = code.replace(/\n$/, '').split('\n');

  async function copy() {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(code);
      setStatus('copied');
      timer.current = setTimeout(() => setStatus('idle'), COPIED_MS);
    } catch {
      setStatus('failed');
    }
  }

  return (
    <div className={cx('g-code', terminal && 'g-code--terminal', className)} {...rest}>
      <div className="g-code__header">
        <span className="g-code__name">{name}</span>
        {copyable ? (
          <>
            <button type="button" className="g-code__copy" onClick={copy}>
              <Icon path={status === 'copied' ? CHECK_ICON : COPY_ICON} />
              {status === 'copied' ? copiedLabel : copyLabel}
            </button>
            <span className="g-code__status" role="status">
              {status === 'copied' ? copiedLabel : status === 'failed' ? failedLabel : ''}
            </span>
          </>
        ) : null}
      </div>
      {/* A scrollable region must take focus so a keyboard can scroll it (axe: scrollable-region-focusable). */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div className="g-code__body" role="region" aria-label={name} tabIndex={0}>
        <pre className="g-code__pre">
          <code>
            {lines.map((line, i) => (
              <span
                key={i}
                className={cx('g-code__line', marked.has(i + 1) && 'g-code__line--highlight')}
                data-highlighted={marked.has(i + 1) ? 'true' : undefined}
              >
                {line === '' ? ' ' : line}
              </span>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}
