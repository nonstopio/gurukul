import { isItemDone, itemsOf } from '@gurukul/schema';
import type { Course } from '@gurukul/schema';
import type { ProgressRow } from '../data/types';
import { orderAssigned } from './model';
import type { AssignedCourse } from './model';

/** Minutes of lessons still to do in a course (Quizzes have no length of their own). */
export function minutesLeft(course: Course, progress: ProgressRow): number {
  return itemsOf(course).reduce(
    (sum, i) => (i.type === 'lesson' && !isItemDone(i, progress) ? sum + i.minutes : sum),
    0,
  );
}

/**
 * Up to `max` courses to start next: published courses not started yet, the ones assigned to the
 * person first (in Home order), then the rest as listed.
 */
export function suggestions(
  courses: readonly Course[],
  assigned: readonly AssignedCourse[],
  progress: readonly ProgressRow[],
  max = 3,
): Course[] {
  const started = new Set(progress.map((p) => p.courseId));
  const first = orderAssigned(assigned).map((a) => a.course);
  const rest = courses.filter((c) => !first.some((f) => f.id === c.id));
  return [...first, ...rest]
    .filter((c) => !started.has(c.id) && c.status === 'published')
    .slice(0, max);
}
