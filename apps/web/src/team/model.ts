import type { ChipTone } from '@gurukul/ui';
import type { TeamReport, TeamReportAssignment } from '../console/types';

/** One row of the team report: a member and one of their assignments, or a member with none. */
export interface ReportRow {
  key: string;
  email: string;
  /** Their name once they have signed in, else their email. */
  name: string;
  assignment: TeamReportAssignment | null;
}

/** Not finished and its due date has passed. */
export const isOverdue = (a: TeamReportAssignment, now: number): boolean =>
  a.status !== 'completed' && a.dueAt !== null && a.dueAt < now;

/**
 * Where a row sorts: overdue first (the longest overdue on top), then the rest still to do by due
 * date (none last), then finished ones, then members with nothing assigned.
 */
function rank(row: ReportRow, now: number): [number, number] {
  const a = row.assignment;
  if (a === null) return [4, 0];
  if (isOverdue(a, now)) return [0, a.dueAt as number];
  if (a.status === 'completed') return [3, 0];
  return a.dueAt === null ? [2, 0] : [1, a.dueAt];
}

/** The report as table rows, overdue first; ties by name, then course. */
export function reportRows(report: TeamReport, now: number): ReportRow[] {
  const rows = report.members.flatMap((m): ReportRow[] => {
    const name = m.displayName || m.email;
    return m.assignments.length === 0
      ? [{ key: m.email, email: m.email, name, assignment: null }]
      : m.assignments.map((a) => ({ key: a.assignmentId, email: m.email, name, assignment: a }));
  });
  return rows.sort((x, y) => {
    const [gx, dx] = rank(x, now);
    const [gy, dy] = rank(y, now);
    return (
      gx - gy ||
      dx - dy ||
      x.name.localeCompare(y.name) ||
      (x.assignment?.courseTitle ?? '').localeCompare(y.assignment?.courseTitle ?? '')
    );
  });
}

/** The status of an assignment in a word, with the tone of its chip. */
export function statusOf(a: TeamReportAssignment, now: number): { label: string; tone: ChipTone } {
  if (a.status === 'completed') return { label: 'Completed', tone: 'accent' };
  if (isOverdue(a, now)) return { label: 'Overdue', tone: 'danger' };
  return a.status === 'started'
    ? { label: 'In progress', tone: 'info' }
    : { label: 'Not started', tone: 'neutral' };
}

/** Counts for the report's stat cards. */
export function reportCounts(report: TeamReport, now: number) {
  const all = report.members.flatMap((m) => m.assignments);
  return {
    members: report.members.length,
    overdue: all.filter((a) => isOverdue(a, now)).length,
    completed: all.filter((a) => a.status === 'completed').length,
    assigned: all.length,
  };
}

/** Each course assigned on the team, by title, for reminding about one course. */
export function reportCourses(report: TeamReport): Array<{ id: string; title: string }> {
  const seen = new Map<string, string>();
  for (const a of report.members.flatMap((m) => m.assignments)) seen.set(a.courseId, a.courseTitle);
  return [...seen]
    .map(([id, title]) => ({ id, title }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** `YYYY-MM-DD` in the viewer's time zone, as a date field holds it. */
export const dayInput = (ms: number): string => new Date(ms).toLocaleDateString('en-CA');

/** A date field's day as the end of that day, in the viewer's time zone (as Assign saves it). */
export const endOfDay = (day: string): number => Date.parse(`${day}T23:59:59`);
