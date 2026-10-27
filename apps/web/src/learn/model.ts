import { itemsOf, progressPercent } from '@gurukul/schema';
import type { Course } from '@gurukul/schema';
import type { AssignmentRow, ProgressRow } from '../data/types';

export interface AssignedCourse {
  assignment: AssignmentRow;
  course: Course;
  progress: ProgressRow | null;
}

/** 0–100 for a course, from the same helper the function uses, so the UI matches what is stored. */
export function percentFor(course: Course, progress: ProgressRow | null): number {
  return progress ? progressPercent(course, progress) : 0;
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

const EMBED_HOSTS = [
  'www.youtube-nocookie.com',
  'www.youtube.com',
  'youtu.be',
  'www.loom.com',
  'drive.google.com',
  'codesandbox.io',
  'stackblitz.com',
];

/** Embeds only from the allow-list (YouTube, Loom, Google Drive, CodeSandbox, StackBlitz). */
export function isEmbedAllowed(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && EMBED_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

/**
 * The iframe URL for a video block, or null when the link is not one this provider can embed
 * (the player then shows the plain "open in a new tab" link instead).
 */
export function videoEmbedUrl(provider: 'youtube' | 'drive' | 'loom', url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  if (provider === 'youtube') {
    const id =
      u.hostname === 'youtu.be'
        ? u.pathname.slice(1)
        : /^(www\.)?youtube(-nocookie)?\.com$/.test(u.hostname)
          ? u.pathname.startsWith('/embed/')
            ? u.pathname.slice('/embed/'.length)
            : u.searchParams.get('v')
          : null;
    return id && /^[\w-]{3,}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (provider === 'loom') {
    const m = /^\/(?:share|embed)\/([\w-]+)/.exec(u.pathname);
    return u.hostname === 'www.loom.com' && m ? `https://www.loom.com/embed/${m[1]}` : null;
  }
  const m = /^\/file\/d\/([\w-]+)/.exec(u.pathname);
  return u.hostname === 'drive.google.com' && m
    ? `https://drive.google.com/file/d/${m[1]}/preview`
    : null;
}
