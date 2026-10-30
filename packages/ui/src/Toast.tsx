import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { AlertIcon, CheckIcon, InfoIcon, XIcon } from './Icon';
import './toast.css';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface ToastAction {
  label: string;
  /** Runs on click; the toast closes afterwards. */
  onSelect: () => void;
}

export interface ToastOptions {
  /** Default: `info`. `danger` is announced assertively; the others politely. */
  tone?: ToastTone;
  /** Bold first line, in words. The message is the one line of detail under it. */
  title?: string | undefined;
  /** A stable error code such as `NET-OFFLINE`, shown in the mono face. */
  code?: string | undefined;
  /** One next step, such as Retry or Undo. */
  action?: ToastAction | undefined;
  /** Milliseconds before it closes itself; `0` keeps it until dismissed. Default: by tone. */
  duration?: number;
}

export interface ToastApi {
  /** Shows a toast and returns its id. */
  show: (message: string, options?: ToastOptions) => number;
  /** Closes a toast early. Unknown ids are ignored. */
  dismiss: (id: number) => void;
}

/** How long each tone stays, in ms. An error stays until it is closed. */
export const TOAST_DURATIONS: Record<ToastTone, number> = {
  success: 4000,
  info: 6000,
  warning: 8000,
  danger: 0,
};
const MAX_VISIBLE = 3;
/** Matches `--dur-fast`; the exit animation runs this long before the toast leaves the DOM. */
const EXIT_MS = 150;
const KIND_WORD: Record<ToastTone, string> = {
  success: 'Success',
  info: 'Notice',
  warning: 'Warning',
  danger: 'Error',
};
const KIND_ICON = {
  success: CheckIcon,
  info: InfoIcon,
  warning: AlertIcon,
  danger: XIcon,
};

interface ToastEntry {
  id: number;
  message: string;
  tone: ToastTone;
  title: string | undefined;
  code: string | undefined;
  action: ToastAction | undefined;
  duration: number;
  leaving: boolean;
}

const ToastContext = createContext<ToastApi | null>(null);

export interface ToastProviderProps {
  children: ReactNode;
  /** Auto-dismiss time in ms for every tone. Default: by tone (4s, 6s, 8s, errors stay). */
  duration?: number;
  /** Accessible name of the dismiss button. Default: "Dismiss". */
  dismissLabel?: string;
}

/** Holds the toast queue and the two live regions. Mount it once, near the app root. */
export function ToastProvider({
  children,
  duration,
  dismissLabel = 'Dismiss',
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((all) => all.filter((t) => t.id !== id)), EXIT_MS);
  }, []);

  const show = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const id = nextId.current++;
      const tone = options.tone ?? 'info';
      const entry: ToastEntry = {
        id,
        message,
        tone,
        title: options.title,
        code: options.code,
        action: options.action,
        duration: options.duration ?? duration ?? TOAST_DURATIONS[tone],
        leaving: false,
      };
      // Three at a time: the oldest is dropped.
      setToasts((all) => [...all, entry].slice(-MAX_VISIBLE));
      return id;
    },
    [duration],
  );

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  // Two regions, always mounted, so screen readers hear what is added to them.
  const region = (role: 'status' | 'alert') => (
    <div className="g-toast-region" role={role}>
      {toasts
        .filter((t) => (t.tone === 'danger') === (role === 'alert'))
        .map((t) => (
          <ToastItem key={t.id} toast={t} dismissLabel={dismissLabel} onDismiss={dismiss} />
        ))}
    </div>
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="g-toast-viewport">
        {region('alert')}
        {region('status')}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  dismissLabel,
  onDismiss,
}: {
  toast: ToastEntry;
  dismissLabel: string;
  onDismiss: (id: number) => void;
}) {
  const { id, duration, leaving, tone, action } = toast;
  const [paused, setPaused] = useState(false);
  const left = useRef(duration);
  const ref = useRef<HTMLDivElement>(null);
  // Hover and focus hold the timer. Native listeners: the toast itself is not interactive.
  useEffect(() => {
    const el = ref.current as HTMLDivElement;
    const on = () => setPaused(true);
    const off = () => setPaused(false);
    const events: Array<[string, () => void]> = [
      ['mouseenter', on],
      ['mouseleave', off],
      ['focusin', on],
      ['focusout', off],
    ];
    events.forEach(([name, fn]) => el.addEventListener(name, fn));
    return () => events.forEach(([name, fn]) => el.removeEventListener(name, fn));
  }, []);
  // The timeout runs only while not paused; what is left of it is kept for the next run.
  useEffect(() => {
    if (duration <= 0 || paused || leaving) return;
    const started = Date.now();
    const timer = setTimeout(() => onDismiss(id), left.current);
    return () => {
      clearTimeout(timer);
      left.current -= Date.now() - started;
    };
  }, [id, duration, paused, leaving, onDismiss]);

  const Icon = KIND_ICON[tone];
  return (
    <div
      className={`g-toast g-toast--${tone}`}
      data-leaving={leaving || undefined}
      data-paused={paused || undefined}
      ref={ref}
    >
      <span className="g-toast__icon">
        <Icon />
      </span>
      <div className="g-toast__body">
        <p className="g-toast__title">
          <span className="g-toast__sr">{KIND_WORD[tone]}: </span>
          {toast.title ?? toast.message}
        </p>
        {toast.title ? <p className="g-toast__message">{toast.message}</p> : null}
        {toast.code ? <code className="g-toast__code">{toast.code}</code> : null}
        {action ? (
          <button
            type="button"
            className="g-toast__action"
            onClick={() => {
              action.onSelect();
              onDismiss(id);
            }}
          >
            {action.label}
          </button>
        ) : null}
      </div>
      <button type="button" className="g-toast__close" onClick={() => onDismiss(id)}>
        <XIcon />
        <span className="g-toast__sr">{dismissLabel}</span>
      </button>
      {duration > 0 ? (
        <i
          className="g-toast__timer"
          aria-hidden="true"
          style={{ animationDuration: `${duration}ms` }}
        />
      ) : null}
    </div>
  );
}

/** `const toast = useToast(); toast.show('Saved', { tone: 'success' })`. Needs a `ToastProvider`. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside a ToastProvider');
  return api;
}
