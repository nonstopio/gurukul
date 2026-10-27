import { lastWeeks } from '@gurukul/schema';
import type { CourseStats, OrgStats } from '@gurukul/schema';
import type { ProgressRow } from '../data/types';
import type { AssignmentFull, UserRow } from './types';

export type LearnerStatus = 'active' | 'invited';

export interface LearnerRow {
  /** `uid` for people who signed in, the email for pending invites. */
  key: string;
  uid: string | null;
  email: string;
  name: string;
  team: string | null;
  roles: string[];
  status: LearnerStatus;
  /** Courses assigned / how many are done. */
  assigned: number;
  done: number;
  /** Mean progress across their assigned courses, 0–100. */
  percent: number;
  overdue: boolean;
  lastActive: Date | null;
  invitedAt: Date | null;
}

export const isOverdue = (a: Pick<AssignmentFull, 'dueAt' | 'status'>, now: Date): boolean =>
  a.status !== 'completed' && a.dueAt !== null && a.dueAt.getTime() < now.getTime();

/**
 * One row per person who signed in, plus one per email that has assignments but no account yet
 * (a pending invite). Progress is joined from the page's progress documents.
 */
export function buildLearnerRows(
  users: readonly UserRow[],
  assignments: readonly AssignmentFull[],
  progress: ReadonlyArray<ProgressRow & { uid: string }>,
  now: Date,
  includePending = true,
): LearnerRow[] {
  const byEmail = new Map<string, AssignmentFull[]>();
  for (const a of assignments) byEmail.set(a.email, [...(byEmail.get(a.email) ?? []), a]);

  const signedIn = users.map((u): LearnerRow => {
    const mine = byEmail.get(u.email) ?? [];
    const prog = progress.filter((p) => p.uid === u.uid);
    const percents = mine.map((a) => prog.find((p) => p.courseId === a.courseId)?.percent ?? 0);
    const last = prog
      .map((p) => p.lastActiveAt?.getTime() ?? 0)
      .reduce((a, b) => Math.max(a, b), 0);
    return {
      key: u.uid,
      uid: u.uid,
      email: u.email,
      name: u.displayName || u.email,
      team: u.team,
      roles: u.roles,
      status: 'active',
      assigned: mine.length,
      done: mine.filter((a) => a.status === 'completed').length,
      percent: percents.length
        ? Math.round(percents.reduce((a, b) => a + b, 0) / percents.length)
        : 0,
      overdue: mine.some((a) => isOverdue(a, now)),
      lastActive: last > 0 ? new Date(last) : null,
      invitedAt: null,
    };
  });

  if (!includePending) return signedIn;
  const known = new Set(users.map((u) => u.email));
  const pending = [...byEmail]
    .filter(([email, list]) => !known.has(email) && list.every((a) => a.uid === null))
    .map(([email, list]): LearnerRow => ({
      key: email,
      uid: null,
      email,
      name: email,
      team: null,
      roles: [],
      status: 'invited',
      assigned: list.length,
      done: 0,
      percent: 0,
      overdue: list.some((a) => isOverdue(a, now)),
      lastActive: null,
      invitedAt:
        list.map((a) => a.assignedAt?.getTime() ?? 0).reduce((a, b) => Math.max(a, b), 0) > 0
          ? new Date(
              list.map((a) => a.assignedAt?.getTime() ?? 0).reduce((a, b) => Math.max(a, b), 0),
            )
          : null,
    }));
  return [...signedIn, ...pending];
}

export type LearnerTab = 'all' | 'signedIn' | 'pending' | 'overdue';

/** Keeps rows holding `role`; an empty role keeps everyone. */
export function filterByRole(rows: readonly LearnerRow[], role: string): LearnerRow[] {
  return role === '' ? [...rows] : rows.filter((r) => r.roles.includes(role));
}

/** Lessons completed in each of the last `n` weeks, oldest first, with zero for quiet weeks. */
export function weeklySeries(stats: Pick<OrgStats, 'weekly'>, now: Date, n = 12) {
  return lastWeeks(now, n).map((week) => ({
    label: week.slice(5),
    value: stats.weekly[week] ?? 0,
  }));
}

/** The funnel for "where learners stop": assigned → started → each parva → completed. */
export function funnelSteps(
  stats: CourseStats,
  parvaTitles: readonly string[],
): Array<{ label: string; value: number }> {
  return [
    { label: 'Assigned', value: stats.assigned },
    { label: 'Started', value: stats.started },
    ...parvaTitles.map((title, i) => ({ label: title, value: stats.parvaCompletions[i] ?? 0 })),
    { label: 'Completed', value: stats.completed },
  ];
}

/** Questions with at least `minTries` first attempts, hardest first. */
export function hardestQuestions(
  stats: Pick<CourseStats, 'questionFirstTry'>,
  limit = 3,
  minTries = 3,
) {
  return Object.entries(stats.questionFirstTry)
    .filter(([, q]) => q.total >= minTries)
    .map(([questionId, q]) => ({
      questionId,
      percent: Math.round((q.correct / q.total) * 100),
      tries: q.total,
    }))
    .sort((a, b) => a.percent - b.percent || a.questionId.localeCompare(b.questionId))
    .slice(0, limit);
}

/** Whole-number percentage, or null when there is nothing to divide by. */
export function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

/** Average days from start to finish, or null with nobody finished. */
export function averageDays(
  stats: Pick<CourseStats, 'finishDaysSum' | 'completed'>,
): number | null {
  return stats.completed > 0 ? Math.round((stats.finishDaysSum / stats.completed) * 10) / 10 : null;
}

/**
 * Rows built straight from assignments, grouped by email: the Pending, Overdue and per-course
 * views. A person with an account is `active`; an email with none is `invited`.
 */
export function rowsFromAssignments(
  assignments: readonly AssignmentFull[],
  now: Date,
): LearnerRow[] {
  const byEmail = new Map<string, AssignmentFull[]>();
  for (const a of assignments) byEmail.set(a.email, [...(byEmail.get(a.email) ?? []), a]);
  return [...byEmail].map(([email, list]) => {
    const uid = list.find((a) => a.uid !== null)?.uid ?? null;
    const assignedAt = Math.max(0, ...list.map((a) => a.assignedAt?.getTime() ?? 0));
    return {
      key: uid ?? email,
      uid,
      email,
      name: email,
      team: null,
      roles: [],
      status: uid === null ? 'invited' : 'active',
      assigned: list.length,
      done: list.filter((a) => a.status === 'completed').length,
      percent: 0,
      overdue: list.some((a) => isOverdue(a, now)),
      lastActive: null,
      invitedAt: assignedAt > 0 ? new Date(assignedAt) : null,
    } satisfies LearnerRow;
  });
}

/** Plain-English names for the audit actions the functions write. */
const AUDIT_LABELS: Record<string, string> = {
  assign: 'Assigned courses',
  'reminders.send': 'Sent reminders',
  'roles.set': 'Changed a role',
  'roles.bootstrap': 'Granted the first Kulapati role',
  'cooldown.reset': 'Opened a Pariksha retake',
  'certificate.revoke': 'Revoked a certificate',
  'certificate.restore': 'Restored a certificate',
  'course.create': 'Created a course',
  'course.publish': 'Published a course',
  'course.rollback': 'Rolled a course back',
  'course.archive': 'Archived or restored a course',
};

/** The audit action in words; an action this build does not know is shown as written. */
export const auditLabel = (action: string): string => AUDIT_LABELS[action] ?? action;

/** One CSV cell. A leading `=`, `+`, `-` or `@` would run as a formula in a spreadsheet, so it is defused. */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const isoDay = (d: Date | null): string => (d ? d.toISOString().slice(0, 10) : '');

/** Every assignment as a CSV, newest first as loaded: who, which course, where it stands. */
export function assignmentsCsv(
  assignments: readonly AssignmentFull[],
  courseTitles: ReadonlyMap<string, string>,
): string {
  const lines = [['Email', 'Course', 'Status', 'Mandatory', 'Assigned', 'Due', 'Signed in']];
  for (const a of assignments) {
    lines.push([
      a.email,
      courseTitles.get(a.courseId) ?? a.courseId,
      a.status,
      a.mandatory ? 'yes' : 'no',
      isoDay(a.assignedAt),
      isoDay(a.dueAt),
      a.uid === null ? 'no' : 'yes',
    ]);
  }
  return lines.map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
}
