// A modal dialog in a portal. Focus moves in on open, Tab wraps inside, Escape and the backdrop
// close it, the page behind cannot scroll, and focus returns to whatever opened it. Without
// `onClose` it is blocking: no close button, Escape and the backdrop do nothing.

import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from './Icon';
import { Mascot } from './Mascot';
import type { MascotState } from './Mascot';
import './dialog.css';

export interface DialogProps {
  open: boolean;
  /** Left out, the dialog cannot be dismissed: only an action in it (the footer) can move on. */
  onClose?: (() => void) | undefined;
  /** The dialog's heading and accessible name. */
  title: string;
  /** `md` is a centred panel, `lg` a wider one for a grid of cards; `drawer` slides in from the right, 480px wide. Default: `md`. */
  size?: 'md' | 'lg' | 'drawer' | undefined;
  /** Pinned under the content, usually buttons. */
  footer?: ReactNode;
  /** Accessible name of the close button. Default: "Close". */
  closeLabel?: string;
  /** The owl's face leading the body, for a dialog that alerts: `warning` for a confirm or delete, `error` for a failure, `new` for an update. */
  mascot?: MascotState | undefined;
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
  mascot,
  children,
}: Omit<DialogProps, 'open'>) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // The latest onClose, so the key listener is installed once and never goes stale.
  const closeFn = useRef(onClose);
  useEffect(() => {
    closeFn.current = onClose;
  });

  useEffect(() => {
    const opener = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // The first field in the body, else the first control at all (the close button, or the
    // footer's action in a blocking dialog).
    const first =
      (bodyRef.current as HTMLElement).querySelector<HTMLElement>(FOCUSABLE) ??
      ((panelRef.current as HTMLElement).querySelector<HTMLElement>(FOCUSABLE) as HTMLElement);
    first.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeFn.current?.();
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
      {onClose ? (
        <button
          type="button"
          className="g-dialog-backdrop"
          aria-label={`Close ${title.toLowerCase()}`}
          tabIndex={-1}
          onClick={onClose}
        />
      ) : (
        <div className="g-dialog-backdrop" />
      )}
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
          {onClose ? (
            <button
              type="button"
              className="g-dialog__close"
              aria-label={closeLabel}
              onClick={onClose}
            >
              <XIcon />
            </button>
          ) : null}
        </div>
        <div
          className={mascot ? 'g-dialog__body g-dialog__body--mascot' : 'g-dialog__body'}
          ref={bodyRef}
        >
          {mascot ? (
            <>
              <Mascot state={mascot} variant="face" size={40} />
              <div className="g-dialog__content">{children}</div>
            </>
          ) : (
            children
          )}
        </div>
        {footer ? <div className="g-dialog__footer">{footer}</div> : null}
      </div>
    </div>
  );
}
