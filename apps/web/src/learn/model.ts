import { isItemDone, itemsOf, progressPercent, resumeItemId } from '@gurukul/schema';
import type { Course, Item } from '@gurukul/schema';
import type { AssignmentRow, CertificateRow, ProgressRow } from '../data/types';

export interface AssignedCourse {
  assignment: AssignmentRow;
  course: Course;
  progress: ProgressRow | null;
}

/** 0–100 for a course, from the same helper the function uses, so the UI matches what is stored. */
export function percentFor(course: Course, progress: ProgressRow | null): number {
  return progress ? progressPercent(course, progress) : 0;
}

/** An archived course: learners keep their progress and certificate, but its Parikshas are closed. */
export function isRetired(course: Pick<Course, 'status'>): boolean {
  return course.status === 'archived';
}

/**
 * Finished once, and the course has since gained lessons: the certificate stays, the percent drops
 * below 100 against the current course.
 */
export function hasNewLessons(course: Course, progress: ProgressRow | null): boolean {
  return progress?.completedAt != null && percentFor(course, progress) < 100;
}

/**
 * Home ordering: unfinished before finished, then mandatory first, then the earliest due date
 * (no date last), then by title.
 */
export function orderAssigned(rows: readonly AssignedCourse[]): AssignedCourse[] {
  const finished = (r: AssignedCourse) =>
    r.assignment.status === 'completed' || r.progress?.completedAt != null;
  const due = (r: AssignedCourse) => r.assignment.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
  return [...rows].sort(
    (a, b) =>
      Number(finished(a)) - Number(finished(b)) ||
      Number(b.assignment.mandatory) - Number(a.assignment.mandatory) ||
      due(a) - due(b) ||
      a.course.title.localeCompare(b.course.title),
  );
}

/** The first unfinished assigned course other than `exceptCourseId`, in Home order. */
export function nextAssigned(
  rows: readonly AssignedCourse[],
  exceptCourseId: string,
): AssignedCourse | null {
  return (
    orderAssigned(rows).find(
      (r) =>
        r.course.id !== exceptCourseId &&
        r.assignment.status !== 'completed' &&
        r.progress?.completedAt == null,
    ) ?? null
  );
}

/** "45 min", "2 h", "1 h 20 min". */
export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** The course to "continue": the most recently active one that is started but not finished. */
export function continueCourse(
  courses: readonly Course[],
  progress: readonly ProgressRow[],
): { course: Course; progress: ProgressRow } | null {
  const active = progress
    .filter((p) => p.completedAt === null)
    .sort((a, b) => (b.lastActiveAt?.getTime() ?? 0) - (a.lastActiveAt?.getTime() ?? 0));
  for (const p of active) {
    const course = courses.find((c) => c.id === p.courseId);
    if (course) return { course, progress: p };
  }
  return null;
}

const DAY = 86_400_000;

/** "Due in 3 days", "Due today", "Overdue by 2 days" — whole days, calendar-free on purpose. */
export function dueLabel(dueAt: Date, now: Date): { text: string; overdue: boolean } {
  const days = Math.ceil((dueAt.getTime() - now.getTime()) / DAY);
  if (days < 0) return { text: `Overdue by ${-days} day${days === -1 ? '' : 's'}`, overdue: true };
  if (days === 0) return { text: 'Due today', overdue: false };
  return { text: `Due in ${days} day${days === 1 ? '' : 's'}`, overdue: false };
}

/** The first name for the greeting; empty when there is no name. */
export function firstName(displayName: string | null | undefined): string {
  return displayName?.trim().split(/\s+/)[0] ?? '';
}

export function countItems(course: Pick<Course, 'parvas'>) {
  const items = itemsOf(course);
  return {
    lessons: items.filter((i) => i.type === 'lesson').length,
    parikshas: items.filter((i) => i.type === 'pariksha').length,
  };
}

export const LEVEL_LABELS: Record<Course['level'], string> = {
  foundation: 'Foundation',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

/** Past this many assigned courses, Home shows the first ones and a "Show all" button. */
export const ASSIGNED_PREVIEW = 10;

/** The item a learner resumes at, with the parva it sits in; null for a course with no items. */
export function upNext(
  course: Course,
  progress: ProgressRow,
): { item: Item; parva: Course['parvas'][number] } | null {
  const id = resumeItemId(course, progress);
  for (const parva of course.parvas) {
    const item = parva.items.find((i) => i.id === id);
    if (item) return { item, parva };
  }
  return null;
}

/** "You are 44% through Git. One lesson left to finish the Basics parva." */
export function statusLine(course: Course, progress: ProgressRow): string {
  const lead = `You are ${percentFor(course, progress)}% through ${course.title}.`;
  const next = upNext(course, progress);
  if (!next) return lead;
  const left = next.parva.items.filter((i) => !isItemDone(i, progress)).length;
  if (left === 0) return lead;
  const count = left === 1 ? 'One item' : `${left} items`;
  return `${lead} ${count} left to finish the ${next.parva.title} parva.`;
}

export interface Activity {
  id: string;
  kind: 'completed' | 'certificate' | 'pariksha' | 'active';
  text: string;
  at: Date;
}

/**
 * The newest events across my progress and certificates (no separate log in v1): finishing a
 * course, a certificate, a Pariksha attempt, last activity in a course still open.
 */
export function recentActivity(
  courses: readonly Course[],
  progress: readonly ProgressRow[],
  certificates: readonly CertificateRow[],
  limit = 5,
): Activity[] {
  const events: Activity[] = [];
  for (const cert of certificates) {
    events.push({
      id: `cert-${cert.id}`,
      kind: 'certificate',
      text: `Certificate issued for ${cert.courseTitle}`,
      at: cert.issuedAt,
    });
  }
  for (const p of progress) {
    const course = courses.find((c) => c.id === p.courseId);
    if (!course) continue;
    if (p.completedAt) {
      events.push({
        id: `done-${course.id}`,
        kind: 'completed',
        text: `Finished ${course.title}`,
        at: p.completedAt,
      });
    } else if (p.lastActiveAt) {
      events.push({
        id: `active-${course.id}`,
        kind: 'active',
        text: `Worked on ${course.title}`,
        at: p.lastActiveAt,
      });
    }
    for (const [parikshaId, result] of Object.entries(p.pariksha)) {
      const title = itemsOf(course).find((i) => i.id === parikshaId)?.title;
      if (!title || !result.lastAttemptAt) continue;
      events.push({
        id: `pariksha-${course.id}-${parikshaId}`,
        kind: 'pariksha',
        text: `${result.passed ? 'Passed' : 'Attempted'} ${title}`,
        at: result.lastAttemptAt,
      });
    }
  }
  return events.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

/** "3 days ago", "today": whole days, matching `dueLabel`. */
export function agoLabel(at: Date, now: Date): string {
  const days = Math.max(0, Math.floor((now.getTime() - at.getTime()) / DAY));
  if (days === 0) return 'Today';
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
