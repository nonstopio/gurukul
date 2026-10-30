// A modal dialog in a portal. Focus moves in on open, Tab wraps inside, Escape and the backdrop
// close it, the page behind cannot scroll, and focus returns to whatever opened it.

import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from './Icon';
import './dialog.css';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** The dialog's heading and accessible name. */
  title: string;
  /** `md` is a centred panel, `lg` a wider one for a grid of cards; `drawer` slides in from the right, 480px wide. Default: `md`. */
  size?: 'md' | 'lg' | 'drawer' | undefined;
  /** Pinned under the content, usually buttons. */
  footer?: ReactNode;
  /** Accessible name of the close button. Default: "Close". */
  closeLabel?: string;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({ open, ...rest }: DialogProps) {
  if (!open) return null;
  return createPortal(<DialogPanel {...rest} />, document.body);
}

function DialogPanel({
  onClose,
  title,
  size = 'md',
  footer,
  closeLabel = 'Close',
  children,
}: Omit<DialogProps, 'open'>) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // The latest onClose, so the key listener is installed once and never goes stale.
  const closeFn = useRef(onClose);
  useEffect(() => {
    closeFn.current = onClose;
  });

  useEffect(() => {
    const opener = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = (bodyRef.current as HTMLElement).querySelector<HTMLElement>(FOCUSABLE);
    (first ?? (closeRef.current as HTMLElement)).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeFn.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current as HTMLElement;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      const head = items[0] as HTMLElement;
      const tail = items[items.length - 1] as HTMLElement;
      const active = document.activeElement;
      if (!panel.contains(active)) {
        e.preventDefault();
        head.focus();
      } else if (e.shiftKey && active === head) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && active === tail) {
        e.preventDefault();
        head.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      opener.focus();
    };
  }, []);

  return (
    <div className={`g-dialog-layer g-dialog-layer--${size}`}>
      <button
        type="button"
        className="g-dialog-backdrop"
        aria-label={`Close ${title.toLowerCase()}`}
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={`g-dialog g-dialog--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="g-dialog__head">
          <h2 className="g-dialog__title" id={titleId}>
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="g-dialog__close"
            aria-label={closeLabel}
            onClick={onClose}
          >
            <XIcon />
          </button>
        </div>
        <div className="g-dialog__body" ref={bodyRef}>
          {children}
        </div>
        {footer ? <div className="g-dialog__footer">{footer}</div> : null}
      </div>
    </div>
  );
}
