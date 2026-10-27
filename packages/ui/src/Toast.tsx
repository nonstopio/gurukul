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
import './toast.css';

export type ToastTone = 'info' | 'success' | 'danger';

export interface ToastOptions {
  /** Default: `info`. `danger` is announced assertively; the others politely. */
  tone?: ToastTone;
  /** Milliseconds before it closes itself; `0` keeps it until dismissed. Default: the provider's. */
  duration?: number;
}

export interface ToastApi {
  /** Shows a toast and returns its id. */
  show: (message: string, options?: ToastOptions) => number;
  /** Closes a toast early. Unknown ids are ignored. */
  dismiss: (id: number) => void;
}

interface ToastEntry {
  id: number;
  message: string;
  tone: ToastTone;
  duration: number;
}

const ToastContext = createContext<ToastApi | null>(null);

export interface ToastProviderProps {
  children: ReactNode;
  /** Default auto-dismiss time in ms. Default: 5000. */
  duration?: number;
  /** Accessible name of the dismiss button. Default: "Dismiss". */
  dismissLabel?: string;
}

/** Holds the toast queue and the two live regions. Mount it once, near the app root. */
export function ToastProvider({
  children,
  duration = 5000,
  dismissLabel = 'Dismiss',
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const id = nextId.current++;
      const entry = {
        id,
        message,
        tone: options.tone ?? 'info',
        duration: options.duration ?? duration,
      };
      setToasts((all) => [...all, entry]);
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
  const { id, duration } = toast;
  useEffect(() => {
    if (duration <= 0) return;
    const timer = setTimeout(() => onDismiss(id), duration);
    return () => clearTimeout(timer);
  }, [id, duration, onDismiss]);

  return (
    <div className={`g-toast g-toast--${toast.tone}`}>
      <p className="g-toast__message">{toast.message}</p>
      <button type="button" className="g-toast__close" onClick={() => onDismiss(id)}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path
            d="M4 4l8 8M12 4l-8 8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        <span className="g-toast__sr">{dismissLabel}</span>
      </button>
    </div>
  );
}

/** `const toast = useToast(); toast.show('Saved', { tone: 'success' })`. Needs a `ToastProvider`. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside a ToastProvider');
  return api;
}
