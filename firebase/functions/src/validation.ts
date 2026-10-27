import { ApiException } from '@gurukul/schema';

/** `VAL_1001`: a required field is absent. */
export const missing = (field: string): ApiException =>
  new ApiException('VAL_1001', [field], { field });

/** `VAL_1002`: a field is present but wrong, with a short reason for developers. */
export const invalid = (field: string, reason: string): ApiException =>
  new ApiException('VAL_1002', [field, reason], { field });

/** `VAL_1001` when the value is absent, else `VAL_1002`: the one failure of a bad request field. */
export const badField = (field: string, value: unknown, reason: string): ApiException =>
  value === undefined ? missing(field) : invalid(field, reason);

/** `VAL_1004`: a list has too few or too many items. */
export const badCount = (field: string, range: string): ApiException =>
  new ApiException('VAL_1004', [field, range], { field });

const isId = (v: unknown): v is string => typeof v === 'string' && v !== '' && !v.includes('/');

/** A document id: a non-empty string without "/". Anything else is `VAL_1001` or `VAL_1002`. */
export function idField(field: string, value: unknown): string {
  if (!isId(value)) throw badField(field, value, 'must be a non-empty id without "/"');
  return value;
}
