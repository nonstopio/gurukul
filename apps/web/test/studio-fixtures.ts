import { ApiException, buildApiError } from '@gurukul/schema';
import type { ErrorCodeKey } from '@gurukul/schema';
import { ApiClientError } from '../src/api';

/** An `ApiClientError` as the browser would receive it for a catalog code. */
export function apiFailure(code: ErrorCodeKey, details: Record<string, unknown> = {}) {
  return new ApiClientError(400, [buildApiError(new ApiException(code, ['x'], details), 'trace')]);
}
