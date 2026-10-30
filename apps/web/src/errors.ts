import type { ToastApi } from '@gurukul/ui';
import { ApiClientError } from './api';

/**
 * One lookup from a failed API call to what the screen shows: its type, a sentence, whether Retry
 * makes sense and the short code people can quote. The taxonomy is in `.plan/` and in the design
 * system's states-and-feedback note; screens never branch on a code themselves.
 */
export type ErrorType =
  'network' | 'permission' | 'validation' | 'not-found' | 'conflict' | 'rate-limit' | 'server';

export interface DescribedError {
  type: ErrorType;
  /** Safe and friendly; the catalog's text, or the screen's own fallback for an unknown failure. */
  sentence: string;
  retryable: boolean;
  /** `NET-OFFLINE`, `AUTH-FORBIDDEN`, ... for the mono code on a toast or state card. */
  uiCode: string;
  /** Words for the error type: "Network", "Permission", ... */
  kind: string;
  /** A title in words for a toast. */
  title: string;
}

const TYPES: Record<ErrorType, { uiCode: string; kind: string; title: string }> = {
  network: { uiCode: 'NET-TIMEOUT', kind: 'Network', title: "Couldn't reach the server" },
  permission: { uiCode: 'AUTH-FORBIDDEN', kind: 'Permission', title: "You can't do this" },
  validation: { uiCode: 'VAL-FIELD', kind: 'Validation', title: 'Check what you entered' },
  'not-found': { uiCode: 'DATA-NOT-FOUND', kind: 'Not found', title: "Can't find it" },
  conflict: { uiCode: 'DATA-CONFLICT', kind: 'Conflict', title: 'Someone changed it first' },
  'rate-limit': { uiCode: 'API-RATE', kind: 'Rate limit', title: 'Too many requests' },
  server: { uiCode: 'SRV-INTERNAL', kind: 'Server', title: 'Something went wrong on our side' },
};

/** The type of an HTTP-style status from the error catalog. */
function typeOfStatus(status: number): ErrorType {
  if (status === 401 || status === 403) return 'permission';
  if (status === 404) return 'not-found';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate-limit';
  if (status === 503) return 'network';
  if (status >= 500) return 'server';
  return 'validation';
}

/** Turns anything thrown by an action into the type, sentence, retry rule and code to show. */
export function describeError(error: unknown, fallback: string): DescribedError {
  if (!(error instanceof ApiClientError)) {
    return { ...TYPES.server, type: 'server', sentence: fallback, retryable: true };
  }
  const type = typeOfStatus(error.status);
  // A session that ended is its own code: the next step is to sign in again.
  const uiCode = error.code === 'AUTH_1001' ? 'AUTH-EXPIRED' : TYPES[type].uiCode;
  return {
    ...TYPES[type],
    uiCode,
    type,
    sentence: error.userMessage,
    retryable: error.retryable,
  };
}

/**
 * Toasts a failed action with its title, sentence and code. A rate limit warns (it clears by
 * itself); everything else is an error that stays until closed. Pass `retry` to offer Retry when
 * the error says trying again can work.
 */
export function toastError(toast: ToastApi, error: unknown, fallback: string, retry?: () => void) {
  const d = describeError(error, fallback);
  return toast.show(d.sentence, {
    tone: d.type === 'rate-limit' ? 'warning' : 'danger',
    title: d.title,
    code: d.uiCode,
    action: retry && d.retryable ? { label: 'Retry', onSelect: retry } : undefined,
  });
}
