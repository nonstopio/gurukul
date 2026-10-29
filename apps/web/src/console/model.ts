import { lastWeeks, nameKey } from '@gurukul/schema';
import type { Course, CourseStats, OrgStats } from '@gurukul/schema';
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

/** The filters above the Learners table. Each one narrows the rows; together they all apply. */
export interface LearnerFilters {
  search: string;
  team: string;
  role: string;
  courseId: string;
}

/** How long typing must pause before a people search runs. */
export const SEARCH_DELAY_MS = 250;

/** Search starts at two characters, so one keystroke does not read the whole people list. */
export const searchPrefix = (search: string): string => {
  const p = search.trim().toLowerCase();
  return p.length >= 2 ? p : '';
};

/** True when a filter narrows the table to a bounded set, held and paged in memory. */
export const isFiltered = (f: LearnerFilters): boolean =>
  searchPrefix(f.search) !== '' || f.team !== '' || f.role !== '' || f.courseId !== '';

/**
 * One person in the table before their row is built. `user` is null for a pending invite, and for
 * someone known only by their assignments until their profile is read for the page they are on.
 */
export interface Person {
  email: string;
  uid: string | null;
  user: UserRow | null;
}

/** The newest assignments plus the open (pending and overdue) ones, each assignment once. */
export function mergeAssignments(
  newest: readonly AssignmentFull[],
  open: readonly AssignmentFull[],
): AssignmentFull[] {
  const ids = new Set(newest.map((a) => a.id));
  return [...newest, ...open.filter((a) => !ids.has(a.id))];
}

/** One person per email in these assignments, sorted by email. */
export function peopleFromAssignments(assignments: readonly AssignmentFull[]): Person[] {
  const byEmail = new Map<string, string | null>();
  for (const a of assignments) byEmail.set(a.email, byEmail.get(a.email) ?? a.uid);
  return [...byEmail]
    .map(([email, uid]) => ({ email, uid, user: null }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

/**
 * Everyone matching every filter, sorted by email. `users` is the people read for the narrowest
 * people filter (team, role or search), or null when only a course is chosen; `scope` is the
 * assignments in view (the chosen course's, or the newest ones). Pending invites have no team or
 * role, so a team or role filter leaves them out. Search matches the start of a signed-in person's
 * email or name (a pending invite has only an email). `searched` says `users` came from the search
 * itself, which already matched them (by more than the email), so it is not applied to them again.
 */
export function filterPeople(
  users: readonly UserRow[] | null,
  scope: readonly AssignmentFull[],
  f: LearnerFilters,
  searched = false,
): Person[] {
  const fromAssignments = peopleFromAssignments(scope);
  if (users === null) return fromAssignments;
  const prefix = searchPrefix(f.search);
  const inCourse = new Set(scope.map((a) => a.email));
  const inScope = (email: string) => f.courseId === '' || inCourse.has(email);
  const matches = (email: string) => email.startsWith(prefix) && inScope(email);
  const named = (u: UserRow) => nameKey(u.displayName).startsWith(prefix) && inScope(u.email);
  const signedIn = users
    .filter(
      (u) =>
        (searched ? inScope(u.email) : matches(u.email) || named(u)) &&
        (f.team === '' || u.team === f.team) &&
        (f.role === '' || u.roles.includes(f.role)),
    )
    .map((u): Person => ({ email: u.email, uid: u.uid, user: u }));
  const known = new Set(users.map((u) => u.email));
  const pending =
    f.team === '' && f.role === ''
      ? fromAssignments.filter((p) => p.uid === null && !known.has(p.email) && matches(p.email))
      : [];
  return [...signedIn, ...pending].sort((a, b) => a.email.localeCompare(b.email));
}

/** The people on one tab: signed in, pending invites, or anyone with an overdue assignment in scope. */
export function onTab(
  people: readonly Person[],
  tab: LearnerTab,
  scope: readonly AssignmentFull[],
  now: Date,
): Person[] {
  if (tab === 'signedIn') return people.filter((p) => p.uid !== null);
  if (tab === 'pending') return people.filter((p) => p.uid === null);
  if (tab === 'overdue') {
    const late = new Set(scope.filter((a) => isOverdue(a, now)).map((a) => a.email));
    return people.filter((p) => late.has(p.email));
  }
  return [...people];
}

/** How many people each tab holds, for the tab labels. */
export function tabCounts(
  people: readonly Person[],
  scope: readonly AssignmentFull[],
  now: Date,
): Record<LearnerTab, number> {
  const count = (tab: LearnerTab) => onTab(people, tab, scope, now).length;
  return {
    all: people.length,
    signedIn: count('signedIn'),
    pending: count('pending'),
    overdue: count('overdue'),
  };
}

/**
 * Where page `page` of "All" falls when signed-in people (paged from Firestore, `signedIn` of them)
 * come first and pending invites follow: whether the page shows people, and which slice of the
 * pending list fills the rest.
 */
export function allPage(
  page: number,
  pageSize: number,
  signedIn: number,
): { people: boolean; pending: [number, number] } {
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  return {
    people: start < signedIn,
    pending: [Math.max(0, start - signedIn), Math.max(0, end - signedIn)],
  };
}

/** One Pariksha a learner has attempted, as the drawer lists it. */
export interface DrawerPariksha {
  id: string;
  /** The Pariksha's title in the current course, or its id when it no longer exists. */
  title: string;
  attempts: number;
  /** 0..1 */
  best: number;
  passed: boolean;
}

/** One course in the learner drawer: assigned, started, or both. */
export interface DrawerCourse {
  courseId: string;
  title: string;
  assigned: boolean;
  dueAt: Date | null;
  overdue: boolean;
  mandatory: boolean;
  /** Progress 0–100, or null when the learner has not opened the course yet. */
  percent: number | null;
  completed: boolean;
  parikshas: DrawerPariksha[];
}

/** A Pariksha's title in this course, or `null` when the course has none by that id. */
export function parikshaTitle(course: Pick<Course, 'parvas'> | undefined, id: string) {
  for (const parva of course?.parvas ?? []) {
    for (const item of parva.items)
      if (item.type === 'pariksha' && item.id === id) return item.title;
  }
  return null;
}

/**
 * Every course in one person's drawer: each assignment (started or not, with its due date) and
 * each course they opened without one. Assigned courses come first, soonest due first; Parikshas
 * appear once attempted, by title.
 */
export function drawerCourses(
  assignments: readonly AssignmentFull[],
  progress: readonly ProgressRow[],
  courses: readonly Course[],
  now: Date,
): DrawerCourse[] {
  const ids = [
    ...new Set([...assignments.map((a) => a.courseId), ...progress.map((p) => p.courseId)]),
  ];
  const due = (c: DrawerCourse) => c.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
  return ids
    .map((courseId): DrawerCourse => {
      const assignment = assignments.find((a) => a.courseId === courseId);
      const prog = progress.find((p) => p.courseId === courseId);
      const course = courses.find((c) => c.id === courseId);
      return {
        courseId,
        title: course?.title ?? courseId,
        assigned: assignment !== undefined,
        dueAt: assignment?.dueAt ?? null,
        overdue: assignment !== undefined && isOverdue(assignment, now),
        mandatory: assignment?.mandatory === true,
        percent: prog ? prog.percent : null,
        completed: assignment?.status === 'completed' || (prog?.completedAt ?? null) !== null,
        parikshas: Object.entries(prog?.pariksha ?? {})
          .filter(([, r]) => r.attempts > 0)
          .map(([id, r]) => ({
            id,
            title: parikshaTitle(course, id) ?? id,
            attempts: r.attempts,
            best: r.best,
            passed: r.passed,
          })),
      };
    })
    .sort(
      (a, b) =>
        Number(b.assigned) - Number(a.assigned) ||
        due(a) - due(b) ||
        a.title.localeCompare(b.title),
    );
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

/** Most teams `config/org` holds; the rules check the same number. */
export const MAX_TEAMS = 100;
const MAX_TEAM_NAME = 80;

/**
 * The teams list with `name` added at the end, or why it cannot be: blank, longer than a team name
 * may be, already there (in any case), or the list is full. The name is trimmed.
 */
export function addTeam(
  teams: readonly string[],
  name: string,
): { teams: string[] } | { error: string } {
  const team = name.trim();
  if (team === '') return { error: 'Enter a team name.' };
  if (team.length > MAX_TEAM_NAME) return { error: `Use ${MAX_TEAM_NAME} characters or fewer.` };
  if (teams.some((t) => t.toLowerCase() === team.toLowerCase())) {
    return { error: `${team} is already in the list.` };
  }
  if (teams.length >= MAX_TEAMS) return { error: `The list holds at most ${MAX_TEAMS} teams.` };
  return { teams: [...teams, team] };
}
