import { z } from 'zod';

/**
 * The one response shape every Gurukul API returns — success or failure. See
 * `.claude/rules/api-responses.md` and `.plan/16-api-contract.md`. An "API" here is every callable
 * Cloud Function (and any HTTP endpoint added later). Firestore reads under security rules are not
 * APIs: rules answer allow or deny, and the browser maps a denial to a friendly state itself.
 */

export const ERROR_CATEGORIES = [
  'AUTH',
  'VALIDATION',
  'USER',
  'COURSE',
  'PARIKSHA',
  'CERTIFICATE',
  'GENERIC',
] as const;
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

export const apiErrorSchema = z.object({
  /** Stable `PREFIX_NNNN` from `ERROR_CODES`. Clients branch on this, never on message text. */
  code: z.string().regex(/^[A-Z]{3,4}_\d{4}$/),
  title: z.string().min(1),
  category: z.enum(ERROR_CATEGORIES),
  /** True only for transient or system problems that may succeed if tried again. */
  retryable: z.boolean(),
  /** Safe and friendly. Shown to people. */
  userMessage: z.string().min(1),
  /** Technical hint for developers. Never a stack trace, a secret or raw exception text. */
  developerMessage: z.string().min(1),
  /** Structured context (the field, the id, `nextAttemptAt`). Always present, `{}` when empty. */
  details: z.record(z.string(), z.unknown()),
  /** Correlates this response with the server log line. */
  traceId: z.string().min(1),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/** `ApiResponse<T>`: all six keys are always present. `data` is null on failure, `errors` empty on success. */
export const apiResponseSchema = <T extends z.ZodType>(data: T) =>
  z
    .object({
      timestamp: z.iso.datetime(),
      status: z.number().int().min(100).max(599),
      success: z.boolean(),
      message: z.string().min(1),
      data: data.nullable(),
      errors: z.array(apiErrorSchema),
    })
    .refine((r) => r.success === (r.status < 400 && r.errors.length === 0), {
      message: 'success must be true exactly when status < 400 and there are no errors',
    })
    .refine((r) => r.success || (r as unknown as { data: unknown }).data === null, {
      message: 'a failure carries no data',
    });

export interface ApiResponse<T> {
  timestamp: string;
  status: number;
  success: boolean;
  message: string;
  data: T | null;
  errors: ApiError[];
}

interface ErrorDef {
  title: string;
  category: ErrorCategory;
  retryable: boolean;
  /** The HTTP status this error maps to. 4xx for the caller's fault, 5xx for ours. Never 200. */
  status: number;
  userMessage: string;
  /** `%s` placeholders are filled from the `params` passed when the error is raised. */
  developerMessage: string;
}

/**
 * Every error the APIs can return. Pattern `PREFIX_NNNN`: AUTH, VAL, USR, CRS, PRK, CRT, GEN.
 * Reuse a code that fits before adding one; to add one, pick the next free number in its prefix,
 * give it every field below and a test (see the checklist in `.claude/rules/api-responses.md`).
 */
export const ERROR_CODES = {
  AUTH_1001: {
    title: 'Not signed in',
    category: 'AUTH',
    retryable: false,
    status: 401,
    userMessage: 'Please sign in to continue.',
    developerMessage: 'The request carries no authenticated user.',
  },
  AUTH_1002: {
    title: 'Not a NonStop account',
    category: 'AUTH',
    retryable: false,
    status: 403,
    userMessage: 'Gurukul is for NonStop io accounts.',
    developerMessage: 'The token email is not a verified @nonstopio.com Google account.',
  },
  AUTH_2001: {
    title: 'Not allowed',
    category: 'AUTH',
    retryable: false,
    status: 403,
    userMessage: 'You do not have permission to do this.',
    developerMessage: 'The caller lacks the role required for %s.',
  },
  VAL_1001: {
    title: 'Missing required field',
    category: 'VALIDATION',
    retryable: false,
    status: 400,
    userMessage: 'A required value is missing.',
    developerMessage: "Field '%s' is missing.",
  },
  VAL_1002: {
    title: 'Invalid field value',
    category: 'VALIDATION',
    retryable: false,
    status: 400,
    userMessage: 'One of the values is not valid.',
    developerMessage: "Field '%s' is invalid: %s.",
  },
  VAL_1003: {
    title: 'Unknown reference',
    category: 'VALIDATION',
    retryable: false,
    status: 400,
    userMessage: 'Something you referred to does not exist.',
    developerMessage: "Unknown %s '%s'.",
  },
  VAL_1004: {
    title: 'Wrong number of items',
    category: 'VALIDATION',
    retryable: false,
    status: 400,
    userMessage: 'The list has too many or too few items.',
    developerMessage: "Field '%s' must have %s items.",
  },
  USR_1001: {
    title: 'Cannot remove your own Kulapati role',
    category: 'USER',
    retryable: false,
    status: 400,
    userMessage: 'You cannot remove your own Kulapati role.',
    developerMessage: 'A Kulapati asked to demote themselves; another Kulapati must do it.',
  },
  USR_2001: {
    title: 'User not found',
    category: 'USER',
    retryable: false,
    status: 404,
    userMessage: 'That person could not be found.',
    developerMessage: "No user '%s' exists.",
  },
  CRS_1001: {
    title: 'Course not published',
    category: 'COURSE',
    retryable: false,
    status: 400,
    userMessage: 'That course is not available yet.',
    developerMessage: "Course '%s' is not published.",
  },
  CRS_1002: {
    title: 'Course id already taken',
    category: 'COURSE',
    retryable: false,
    status: 409,
    userMessage: 'A course with that address already exists. Choose another.',
    developerMessage: "A course with id '%s' already exists.",
  },
  CRS_1003: {
    title: 'Course has problems to fix',
    category: 'COURSE',
    retryable: false,
    status: 400,
    userMessage: 'This course has problems to fix before it can be published.',
    developerMessage: "Course '%s' failed the publish checks; see details.issues.",
  },
  CRS_1004: {
    title: 'Course retired',
    category: 'COURSE',
    retryable: false,
    status: 400,
    userMessage:
      'This course is retired. Your progress and certificate are kept, but its Parikshas are closed.',
    developerMessage: "Course '%s' is archived; it takes no new Pariksha attempts.",
  },
  CRS_2001: {
    title: 'Course not found',
    category: 'COURSE',
    retryable: false,
    status: 404,
    userMessage: 'That course could not be found.',
    developerMessage: "No course '%s' exists.",
  },
  CRS_2002: {
    title: 'Version not found',
    category: 'COURSE',
    retryable: false,
    status: 404,
    userMessage: 'That version of the course could not be found.',
    developerMessage: "Course '%s' has no version %s.",
  },
  CRS_3001: {
    title: 'Course data is invalid',
    category: 'COURSE',
    retryable: false,
    status: 500,
    userMessage: 'This course has a problem. Please tell an administrator.',
    developerMessage: "Course '%s' does not match the course schema.",
  },
  PRK_1001: {
    title: 'Answers are not revealed',
    category: 'PARIKSHA',
    retryable: false,
    status: 400,
    userMessage: 'This Pariksha checks your answers at the end.',
    developerMessage: "Pariksha '%s' does not reveal answers per question.",
  },
  PRK_1002: {
    title: 'Question set does not match',
    category: 'PARIKSHA',
    retryable: false,
    status: 400,
    userMessage: 'Those questions do not belong to this Pariksha.',
    developerMessage: 'The submitted question ids are not a valid draw: %s.',
  },
  PRK_1003: {
    title: 'Pariksha is locked',
    category: 'PARIKSHA',
    retryable: false,
    status: 403,
    userMessage: 'Finish the earlier parts of this course to open this Pariksha.',
    developerMessage: "Pariksha '%s' is locked for this learner.",
  },
  PRK_2001: {
    title: 'Pariksha not found',
    category: 'PARIKSHA',
    retryable: false,
    status: 404,
    userMessage: 'That Pariksha could not be found.',
    developerMessage: "No Pariksha '%s' in course '%s'.",
  },
  PRK_2002: {
    title: 'Course not started',
    category: 'PARIKSHA',
    retryable: false,
    status: 400,
    userMessage: 'Open a lesson in this course first.',
    developerMessage: "No progress document for course '%s'.",
  },
  PRK_3001: {
    title: 'Answer key missing',
    category: 'PARIKSHA',
    retryable: false,
    status: 500,
    userMessage: 'This Pariksha cannot be graded right now. Please tell an administrator.',
    developerMessage: "No answer key for %s '%s'.",
  },
  PRK_4001: {
    title: 'Retake not open yet',
    category: 'PARIKSHA',
    retryable: true,
    status: 429,
    userMessage: 'You can retake this Pariksha a little later.',
    developerMessage: 'Cooldown active until %s.',
  },
  CRT_2001: {
    title: 'Certificate not found',
    category: 'CERTIFICATE',
    retryable: false,
    status: 404,
    userMessage: 'That certificate could not be found.',
    developerMessage: "No certificate '%s' exists.",
  },
  GEN_5000: {
    title: 'Unexpected error',
    category: 'GENERIC',
    retryable: true,
    status: 500,
    userMessage: 'Something went wrong on our side. Please try again.',
    developerMessage: 'An unhandled exception was logged with this traceId.',
  },
  GEN_5003: {
    title: 'Temporarily unavailable',
    category: 'GENERIC',
    retryable: true,
    status: 503,
    userMessage: 'Gurukul is busy right now. Please try again in a moment.',
    developerMessage: 'A dependency was unavailable: %s.',
  },
} as const satisfies Record<string, ErrorDef>;

export type ErrorCodeKey = keyof typeof ERROR_CODES;

/** Fills `%s` placeholders in order; missing params leave `?`, extra params are ignored. */
export function formatMessage(template: string, params: readonly string[] = []): string {
  let i = 0;
  return template.replace(/%s/g, () => params[i++] ?? '?');
}

/**
 * A domain failure. Throw this from services; the API wrapper turns it into the response. Never
 * throw a bare `Error` with a vague message for something a caller can cause or fix.
 */
export class ApiException extends Error {
  constructor(
    readonly code: ErrorCodeKey,
    readonly params: readonly string[] = [],
    readonly details: Record<string, unknown> = {},
  ) {
    super(`${code}: ${formatMessage(ERROR_CODES[code].developerMessage, params)}`);
    this.name = 'ApiException';
  }
}

/** Builds one `ApiError` from the catalog. */
export function buildApiError(e: ApiException, traceId: string): ApiError {
  const def = ERROR_CODES[e.code];
  return {
    code: e.code,
    title: def.title,
    category: def.category,
    retryable: def.retryable,
    userMessage: def.userMessage,
    developerMessage: formatMessage(def.developerMessage, e.params),
    details: { ...e.details },
    traceId,
  };
}

/** A success response. `status` defaults to 200; 201 for a create that returns the new thing. */
export function apiOk<T>(
  data: T,
  opts: { status?: number; message?: string; now?: Date } = {},
): ApiResponse<T> {
  return {
    timestamp: (opts.now ?? new Date()).toISOString(),
    status: opts.status ?? 200,
    success: true,
    message: opts.message ?? 'OK',
    data,
    errors: [],
  };
}

/** A failure response: the status and message come from the first error's catalog entry. */
export function apiFail(
  exceptions: readonly ApiException[],
  traceId: string,
  now: Date = new Date(),
): ApiResponse<never> {
  const first = exceptions[0] ?? new ApiException('GEN_5000');
  return {
    timestamp: now.toISOString(),
    status: ERROR_CODES[first.code].status,
    success: false,
    message: ERROR_CODES[first.code].title,
    data: null,
    errors: (exceptions.length ? exceptions : [first]).map((e) => buildApiError(e, traceId)),
  };
}
