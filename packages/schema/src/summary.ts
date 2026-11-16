import { z } from 'zod';
import { accessOf, MAX_VISIBLE_TEAMS, visibilitySchema } from './access';
import { courseSchema } from './course';
import type { Course } from './course';
import { readCourse } from './migrations';
import { itemsOf } from './progress';
import { timestamp } from './timestamp';

/**
 * Bump when `summariseCourse` derives something new or differently: the nightly reconcile rewrites
 * every summary stored at another version, so a deploy needs no hand-run backfill.
 */
export const COURSE_SUMMARY_VERSION = 1;

/**
 * `courseSummaries/{courseId}`: what a tile, a list row or a search result shows, so a list never
 * downloads whole courses. Derived from `courses/{courseId}` by the `onCourseWritten` function and
 * nothing else; no lesson content, no questions, never an answer key. `status`, `visibility` and
 * `visibleTeamIds` are copied as they are because the rules read them: a summary is readable by
 * exactly the people who may read its course (`.plan/02-data-model.md`).
 */
export const courseSummarySchema = courseSchema
  .pick({
    id: true,
    title: true,
    summary: true,
    level: true,
    educatorIds: true,
    status: true,
    version: true,
    publishedAt: true,
    estimatedMinutes: true,
  })
  .extend({
    summaryVersion: z.number().int(),
    cover: courseSchema.shape.cover.pick({ theme: true, glyph: true }),
    /** The tile's picture: the cover image, else the first image in a lesson; absent when neither. */
    image: z.url().optional(),
    chapters: z.number().int().min(0),
    lessons: z.number().int().min(0),
    quizzes: z.number().int().min(0),
    /** `rules.certificate`: finishing the course earns one. */
    certificate: z.boolean(),
    visibility: visibilitySchema,
    visibleTeamIds: z.array(z.string()).max(MAX_VISIBLE_TEAMS),
    /** The course document's update time when this was derived; how the reconcile spots a stale one. */
    courseUpdatedAt: timestamp.optional(),
  });
export type CourseSummary = z.infer<typeof courseSummarySchema>;

/**
 * A course's picture for a tile: its cover image, else the first image in its lessons, in course
 * order. A course with no picture gets none, and its tile shows the course name on its own colour.
 */
export function courseImage(course: Pick<Course, 'chapters' | 'cover'>): string | undefined {
  if (course.cover.image) return course.cover.image.url;
  for (const item of itemsOf(course)) {
    if (item.type !== 'lesson') continue;
    const image = item.blocks.find((b) => b.type === 'image');
    if (image?.type === 'image') return image.url;
  }
  return undefined;
}

/**
 * The summary of a stored `courses/{id}` document (course object plus the access fields beside
 * it), or `null` for one this code cannot read: such a course is skipped by every list already.
 */
export function summariseCourse(raw: unknown): CourseSummary | null {
  const course = readCourse(raw);
  if (course === null) return null;
  const items = itemsOf(course);
  const image = courseImage(course);
  return {
    summaryVersion: COURSE_SUMMARY_VERSION,
    id: course.id,
    title: course.title,
    summary: course.summary,
    level: course.level,
    cover: { theme: course.cover.theme, glyph: course.cover.glyph },
    ...(image === undefined ? {} : { image }),
    educatorIds: course.educatorIds,
    status: course.status,
    version: course.version,
    publishedAt: course.publishedAt,
    estimatedMinutes: course.estimatedMinutes,
    chapters: course.chapters.length,
    lessons: items.filter((i) => i.type === 'lesson').length,
    quizzes: items.filter((i) => i.type === 'quiz').length,
    certificate: course.rules.certificate,
    ...accessOf(raw),
  };
}
