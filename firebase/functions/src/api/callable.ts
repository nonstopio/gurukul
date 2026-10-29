import { ApiException, apiFail, apiOk } from '@gurukul/schema';
import type { ApiResponse } from '@gurukul/schema';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { CallableOptions, CallableRequest } from 'firebase-functions/v2/https';
import { log } from '../logging/log.js';
import { newTraceId, runWithTrace } from './trace.js';

type HttpsCode = ConstructorParameters<typeof HttpsError>[0];

/** The `HttpsError` code for an envelope's HTTP status. */
const CODE_FOR_STATUS: Record<number, HttpsCode> = {
  400: 'invalid-argument',
  401: 'unauthenticated',
  403: 'permission-denied',
  404: 'not-found',
  409: 'already-exists',
  429: 'resource-exhausted',
  503: 'unavailable',
};
export const httpsCodeFor = (status: number): HttpsCode => CODE_FOR_STATUS[status] ?? 'internal';

interface ZodIssueLike {
  path: PropertyKey[];
  message: string;
}

/** Duck-typed so this folder needs no `zod` import: a request-parsing error carries `issues`. */
function zodIssues(e: unknown): ZodIssueLike[] | undefined {
  if (!(e instanceof Error) || e.name !== 'ZodError') return undefined;
  const { issues } = e as Error & { issues?: unknown };
  return Array.isArray(issues) ? (issues as ZodIssueLike[]) : undefined;
}

/** One `ApiException` per invalid field: `VAL_1001` when the value is absent, else `VAL_1002`. */
function validationExceptions(issues: ZodIssueLike[]): ApiException[] {
  return issues.map((issue) => {
    const field = issue.path.map(String).join('.') || 'request';
    const missing = /received undefined/.test(issue.message);
    return missing
      ? new ApiException('VAL_1001', [field], { field })
      : new ApiException('VAL_1002', [field, issue.message], { field });
  });
}

/** Everything the wrapper can throw becomes catalog exceptions; unknown errors become `GEN_5000`. */
function exceptionsFor(e: unknown): ApiException[] {
  if (e instanceof ApiException) return [e];
  const issues = zodIssues(e);
  return issues !== undefined && issues.length > 0
    ? validationExceptions(issues)
    : [new ApiException('GEN_5000')];
}

/**
 * Creates a callable Cloud Function whose every response is the `ApiResponse` envelope
 * (`.plan/16-api-contract.md`). The handler returns the success `data` and throws `ApiException`
 * for a failure; this is the only place that builds a response, throws `HttpsError`, or logs a
 * thrown error (once). The failure envelope travels as the `HttpsError`'s `details`. `options` go to
 * `onCall` as they are, such as the `secrets` a function reads.
 */
export function apiCallable<Req = unknown, Res = unknown>(
  handler: (request: CallableRequest<Req>) => Promise<Res> | Res,
  options: CallableOptions = {},
) {
  return onCall<Req, Promise<ApiResponse<Res>>>(options, (request) => {
    const traceId = newTraceId();
    return runWithTrace({ traceId }, async () => {
      const started = Date.now();
      const functionName = process.env['FUNCTION_TARGET'];
      log.debug('Callable received', { functionName, uid: request.auth?.uid });
      try {
        const response = apiOk(await handler(request));
        log.info('Callable completed', {
          functionName,
          status: response.status,
          durationMs: Date.now() - started,
        });
        return response;
      } catch (e) {
        const exceptions = exceptionsFor(e);
        const envelope = apiFail(exceptions, traceId);
        const fields = {
          functionName,
          code: envelope.errors[0]?.code,
          status: envelope.status,
          durationMs: Date.now() - started,
        };
        if (envelope.status < 500) log.warn('Callable refused', fields);
        else log.error('Callable failed', e, fields);
        throw new HttpsError(httpsCodeFor(envelope.status), envelope.message, envelope);
      }
    });
  });
}
