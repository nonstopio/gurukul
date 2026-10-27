import { z } from 'zod';

/**
 * The two Firestore SDKs (web and admin) have different `Timestamp` classes. The schema asks only
 * for what both offer, so the same shape validates a document on either side.
 */
export interface TimestampLike {
  toMillis(): number;
  toDate(): Date;
}

export const timestamp = z.custom<TimestampLike>(
  (v) =>
    typeof v === 'object' &&
    v !== null &&
    typeof (v as TimestampLike).toMillis === 'function' &&
    typeof (v as TimestampLike).toDate === 'function',
  'expected a Firestore Timestamp',
);
