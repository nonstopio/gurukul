import { z } from 'zod';
import type { Course } from './course';

/**
 * Who may open a published course. Lives on the course document beside the course object, not
 * inside it, so it is not a course-shape change: `public` is everyone signed in, `teams` is the
 * people on the listed teams, `staff` is every Educator and Admin. A document without it reads as
 * `public`.
 */
export const visibilitySchema = z.enum(['public', 'teams', 'staff']);
export type Visibility = z.infer<typeof visibilitySchema>;

/** Most teams one course can list: the same 30 that Firestore's `array-contains-any` allows. */
export const MAX_VISIBLE_TEAMS = 30;

export const courseAccessSchema = z
  .object({
    visibility: visibilitySchema,
    /** `teamId(name)` of each team; used only when `visibility` is `teams`, and then at least one. */
    visibleTeamIds: z.array(z.string().min(1).max(80)).max(MAX_VISIBLE_TEAMS),
  })
  .refine((a) => a.visibility !== 'teams' || a.visibleTeamIds.length > 0, {
    message: 'pick at least one team',
    path: ['visibleTeamIds'],
  });
export type CourseAccess = z.infer<typeof courseAccessSchema>;

export const PUBLIC_ACCESS: CourseAccess = { visibility: 'public', visibleTeamIds: [] };

/** A course as the catalogue lists it: the course object plus who may open it (absent means public). */
export type CourseListing = Course & Partial<CourseAccess>;

/** The access stored on a course document; anything missing or unreadable is public. */
export function accessOf(raw: unknown): CourseAccess {
  const parsed = courseAccessSchema.safeParse(raw);
  return parsed.success ? parsed.data : PUBLIC_ACCESS;
}

/** The ways a person can match the audience of a course. */
export interface Audience {
  teamIds: readonly string[];
  /** An Educator or an Admin. */
  staff: boolean;
}

/** The rule the database enforces, for screens that mirror it. */
export function canOpen(course: Partial<CourseAccess>, who: Audience): boolean {
  if (who.staff) return true;
  const visibility = course.visibility ?? 'public';
  if (visibility === 'public') return true;
  if (visibility === 'staff') return false;
  return (course.visibleTeamIds ?? []).some((id) => who.teamIds.includes(id));
}
