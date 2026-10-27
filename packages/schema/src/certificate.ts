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
});
export type Certificate = z.infer<typeof certificateSchema>;

/** `NSG-GIT-26-0412`: course code, two-digit year, four-digit sequence. */
export function credentialId(courseCode: string, year: number, sequence: number): string {
  const code = courseCode.replace(/[^a-z0-9]/gi, '').toUpperCase();
  return `NSG-${code}-${String(year % 100).padStart(2, '0')}-${String(sequence).padStart(4, '0')}`;
}
