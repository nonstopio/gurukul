import { z } from 'zod';
import { timestamp } from './timestamp';

export const assignmentSchema = z.object({
  email: z.email(),
  uid: z.string().nullable(),
  courseId: z.string().min(1),
  assignedBy: z.string().min(1),
  assignedAt: timestamp,
  dueAt: timestamp.nullable(),
  mandatory: z.boolean(),
  reminder: z.enum(['weekly', 'beforeDue', 'none']),
  status: z.enum(['assigned', 'started', 'completed']),
  /** When the last reminder email was queued; the 24h cap reads it. Absent until the first one. */
  lastRemindedAt: timestamp.nullable().optional(),
});
export type Assignment = z.infer<typeof assignmentSchema>;

/** Assignments are keyed by lower-cased email so people can be assigned before first sign-in. */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** `{courseId}__{sha256(email)}`: assigning the same course to the same email twice is idempotent. */
export function assignmentId(courseId: string, emailSha1: string): string {
  return `${courseId}__${emailSha1}`;
}
