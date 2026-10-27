import { httpsCallable } from 'firebase/functions';
import type { Functions } from 'firebase/functions';
import { ERROR_CODES, apiErrorSchema, apiResponseSchema } from '@gurukul/schema';
import type { ApiError, ErrorCodeKey } from '@gurukul/schema';

/**
 * The only door from the browser to a Cloud Function. Every callable answers with the `ApiResponse`
 * envelope (`.plan/16-api-contract.md`): this returns its `data` on success and throws an
 * `ApiClientError` on any failure, so a screen never sees a Firebase error or guesses at a shape.
 * `httpsCallable` may be imported nowhere else in the app (ESLint).
 */

// The envelope with any `data`. Borrowed from the error schema so the web app needs no zod import.
const envelope = apiResponseSchema(apiErrorSchema.shape.details.valueType);

/** A failed API call. Screens branch on `code`, never on message text, and show `userMessage`. */
export class ApiClientError extends Error {
  /** The HTTP-style status of the envelope. */
  readonly status: number;
  /** One per problem; the first is the headline. */
  readonly errors: ApiError[];
  /** The first error's code, such as `PRK_4001`. */
  readonly code: string;
  readonly retryable: boolean;
  /** Safe and friendly: the catalog's text for the first error. */
  readonly userMessage: string;
  /** The first error's structured context (`field`, `nextAttemptAt`, ...). */
  readonly details: Record<string, unknown>;
  readonly traceId: string;
  /** True when the failure did not come from a server envelope (offline, timeout, bad response). */
  readonly unexpected: boolean;

  constructor(status: number, errors: ApiError[], unexpected = false) {
    const first = errors[0] as ApiError;
    super(`${first.code}: ${first.developerMessage}`);
    this.name = 'ApiClientError';
    this.status = status;
    this.errors = errors;
    this.code = first.code;
    this.retryable = first.retryable;
    this.userMessage = first.userMessage;
    this.details = first.details;
    this.traceId = first.traceId;
    this.unexpected = unexpected;
  }
}

/** A failure built from the catalog, for when no server envelope reached us. */
function synthetic(code: ErrorCodeKey, developerMessage: string): ApiClientError {
  const def = ERROR_CODES[code];
  return new ApiClientError(
    def.status,
    [
      {
        code,
        title: def.title,
        category: def.category,
        retryable: def.retryable,
        userMessage: def.userMessage,
        developerMessage,
        details: {},
        traceId: 'client',
      },
    ],
    true,
  );
}

/** Firebase codes that mean "could not reach the function" rather than "the function said no". */
const UNREACHABLE = new Set([
  'functions/unavailable',
  'functions/deadline-exceeded',
  'functions/cancelled',
]);

function failureOf(e: unknown): ApiClientError {
  const err = (e ?? {}) as { code?: unknown; message?: unknown; details?: unknown };
  const parsed = envelope.safeParse(err.details);
  if (parsed.success && !parsed.data.success && parsed.data.errors.length > 0) {
    return new ApiClientError(parsed.data.status, parsed.data.errors);
  }
  const why = typeof err.message === 'string' ? err.message : 'The call failed.';
  return typeof err.code === 'string' && UNREACHABLE.has(err.code)
    ? synthetic('GEN_5003', why)
    : synthetic('GEN_5000', why);
}

/** Calls the named function and returns the `data` of its success envelope. Throws `ApiClientError`. */
export async function callApi<Req, Res>(
  functions: Functions,
  name: string,
  request: Req,
): Promise<Res> {
  let body: unknown;
  try {
    body = (await httpsCallable<Req, unknown>(functions, name)(request)).data;
  } catch (e) {
    throw failureOf(e);
  }
  const parsed = envelope.safeParse(body);
  if (!parsed.success || !parsed.data.success) {
    throw synthetic('GEN_5000', `The '${name}' response is not a success envelope.`);
  }
  return parsed.data.data as Res;
}

/** The catalog's friendly text for an `ApiClientError`; the screen's own fallback for anything else. */
export function userMessageOf(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.userMessage : fallback;
}
