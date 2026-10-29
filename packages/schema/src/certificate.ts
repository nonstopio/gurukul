import { z } from 'zod';
import { timestamp } from './timestamp';

export const certificateSchema = z.object({
  id: z.string().regex(/^NSG-[A-Z0-9]+-\d{2}-\d{4,}$/),
  uid: z.string().min(1),
  learnerName: z.string().min(1).max(120),
  courseId: z.string().min(1),
  courseTitle: z.string().min(1),
  courseVersion: z.number().int().min(0),
  issuedAt: timestamp,
  signatoryName: z.string(),
  signatoryRole: z.string(),
  revoked: z.boolean(),
  /** When it was last revoked; null once restored, absent on certificates revoked before it was recorded. */
  revokedAt: timestamp.nullable().optional(),
});
export type Certificate = z.infer<typeof certificateSchema>;

/** `NSG-GIT-26-0412`: course code, two-digit year, four-digit sequence. */
export function credentialId(courseCode: string, year: number, sequence: number): string {
  const code = courseCode.replace(/[^a-z0-9]/gi, '').toUpperCase();
  return `NSG-${code}-${String(year % 100).padStart(2, '0')}-${String(sequence).padStart(4, '0')}`;
}

/** The course code on a credential id: the first hyphen-separated token of the course id, upper-cased (`git-basics` is `GIT`). */
export function courseCode(courseId: string): string {
  return courseId.replace(/-.*$/s, '').toUpperCase();
}
