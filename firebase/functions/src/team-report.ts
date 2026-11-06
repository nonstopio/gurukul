import { ApiException } from '@gurukul/schema';
import { isAdmin, managesTeam, requireAdminOrManager } from './errors.js';
import type { AuditEntry, Caller, TeamRecord } from './errors.js';
import { log } from './logging/log.js';
import { badField, idField } from './validation.js';

type Status = 'assigned' | 'started' | 'completed';

/** The slice of an assignment the team callables read. Times in epoch milliseconds. */
export interface ManagedAssignment {
  id: string;
  email: string;
  uid: string | null;
  courseId: string;
  status: Status;
  dueAt: number | null;
  teamId: string | null;
}

/** Where the team callables read and write. `stores.ts` adapts the Admin SDK. */
export interface TeamReportStore {
  team(teamId: string): Promise<TeamRecord | undefined>;
  assignment(id: string): Promise<ManagedAssignment | undefined>;
  /** Every assignment (any status) of these emails, queried 30 emails at a time. */
  assignmentsFor(emails: string[]): Promise<ManagedAssignment[]>;
  /** For each email with a profile: its uid and display name. */
  profiles(emails: string[]): Promise<Map<string, { uid: string; displayName: string | null }>>;
  /** `progress/{uid}_{courseId}.percent` of each pair that has a progress document. */
  percents(pairs: { uid: string; courseId: string }[]): Promise<Map<string, number>>;
  courseTitles(ids: string[]): Promise<Record<string, string | undefined>>;
  /** Sets `dueAt` and clears `dueSoonSentAt` and `overdueSentAt`, so the notices go out anew. */
  setDueAt(id: string, dueAt: number | null): Promise<void>;
  /** Deletes the assignment and takes it off `stats/course_{id}.assigned` and the org total. */
  deleteAssignment(assignment: ManagedAssignment): Promise<void>;
  audit(entry: AuditEntry): Promise<void>;
}

/** One assignment in the team report. Never a Quiz score. */
export interface TeamReportAssignment {
  assignmentId: string;
  courseId: string;
  courseTitle: string;
  status: Status;
  dueAt: number | null;
  /** 0 to 100. */
  percent: number;
  /** The team it was assigned through: a Manager may change or remove only their teams' ones. */
  teamId: string | null;
}

export interface TeamReportMember {
  email: string;
  /** Null until the person signs in for the first time. */
  uid: string | null;
  displayName: string | null;
  assignments: TeamReportAssignment[];
}

/** What `teamReport` returns. */
export interface TeamReport {
  teamId: string;
  name: string;
  members: TeamReportMember[];
}

/** The team, once the caller is known to manage it: `VAL_1003` when missing, else `AUTH_2001`. */
async function managedTeam(
  store: TeamReportStore,
  caller: Caller,
  id: string,
  action: string,
): Promise<TeamRecord> {
  const team = await store.team(id);
  if (team === undefined) throw new ApiException('VAL_1003', ['team', id], { field: 'teamId' });
  if (!managesTeam(caller, team)) throw new ApiException('AUTH_2001', [action], { teamId: id });
  return team;
}

/**
 * `teamReport`: an Admin, or a Manager of the team, sees each member's assignments with status,
 * due date and percent. Reads one team, one profile query and one assignments query per 30
 * members, and one progress document per started assignment.
 */
export async function teamReport(
  store: TeamReportStore,
  caller: Caller,
  data: { teamId?: unknown },
): Promise<TeamReport> {
  requireAdminOrManager(caller, 'teamReport');
  const id = idField('teamId', data.teamId);
  const team = await managedTeam(store, caller, id, 'teamReport');
  const emails = [...new Set(team.memberEmails.map((e) => e.trim().toLowerCase()))];
  const [assignments, profiles] =
    emails.length === 0
      ? [[], new Map<string, { uid: string; displayName: string | null }>()]
      : await Promise.all([store.assignmentsFor(emails), store.profiles(emails)]);
  const uidOf = (a: ManagedAssignment): string | null =>
    a.uid ?? profiles.get(a.email)?.uid ?? null;
  const started = assignments.filter((a) => a.status === 'started' && uidOf(a) !== null);
  const pairs = started.map((a) => ({ uid: uidOf(a) as string, courseId: a.courseId }));
  const percents = pairs.length === 0 ? new Map<string, number>() : await store.percents(pairs);
  const courseIds = [...new Set(assignments.map((a) => a.courseId))];
  const titles = courseIds.length === 0 ? {} : await store.courseTitles(courseIds);
  const percentOf = (a: ManagedAssignment): number => {
    if (a.status === 'completed') return 100;
    const uid = uidOf(a);
    return a.status === 'assigned' || uid === null
      ? 0
      : (percents.get(`${uid}_${a.courseId}`) ?? 0);
  };
  const members = emails.map((email) => {
    const profile = profiles.get(email);
    return {
      email,
      uid: profile?.uid ?? null,
      displayName: profile?.displayName ?? null,
      assignments: assignments
        .filter((a) => a.email === email)
        .map((a) => ({
          assignmentId: a.id,
          courseId: a.courseId,
          courseTitle: titles[a.courseId] ?? a.courseId,
          status: a.status,
          dueAt: a.dueAt,
          percent: percentOf(a),
          teamId: a.teamId,
        })),
    };
  });
  log.debug('Team report built', { teamId: id, count: members.length });
  return { teamId: id, name: team.name, members };
}

/**
 * The assignment, once the caller may change it: an Admin any, a Manager only one made through a
 * team they manage. `VAL_1003` when it does not exist.
 */
async function managedAssignment(
  store: TeamReportStore,
  caller: Caller,
  id: string,
  action: string,
): Promise<ManagedAssignment> {
  const assignment = await store.assignment(id);
  if (assignment === undefined) {
    throw new ApiException('VAL_1003', ['assignment', id], { field: 'assignmentId' });
  }
  if (isAdmin(caller)) return assignment;
  const team = assignment.teamId === null ? undefined : await store.team(assignment.teamId);
  if (team === undefined || !managesTeam(caller, team)) {
    throw new ApiException('AUTH_2001', [action], { assignmentId: id });
  }
  return assignment;
}

/**
 * `updateAssignment`: a new due date (ms) or none (null). Clears the deadline notices' stamps, so
 * the new date gets its own due-soon and overdue notices. A date in the past is refused.
 */
export async function updateAssignment(
  store: TeamReportStore,
  caller: Caller,
  data: { assignmentId?: unknown; dueAt?: unknown },
  now: number,
): Promise<{ assignmentId: string; dueAt: number | null }> {
  requireAdminOrManager(caller, 'updateAssignment');
  const id = idField('assignmentId', data.assignmentId);
  const { dueAt } = data;
  if (dueAt !== null && (typeof dueAt !== 'number' || !Number.isFinite(dueAt))) {
    throw badField('dueAt', dueAt, 'must be a time in milliseconds, or null');
  }
  if (dueAt !== null && dueAt < now) throw badField('dueAt', dueAt, 'must not be in the past');
  const assignment = await managedAssignment(store, caller, id, 'updateAssignment');
  await store.setDueAt(id, dueAt);
  await store.audit({
    action: 'assign.update',
    by: caller.uid,
    target: id,
    detail: { courseId: assignment.courseId, teamId: assignment.teamId, dueAt },
  });
  log.info('Assignment due date changed', { assignmentId: id, courseId: assignment.courseId });
  return { assignmentId: id, dueAt };
}

/** `removeAssignment`: takes the course off the person's list; their progress stays. */
export async function removeAssignment(
  store: TeamReportStore,
  caller: Caller,
  data: { assignmentId?: unknown },
): Promise<{ assignmentId: string }> {
  requireAdminOrManager(caller, 'removeAssignment');
  const id = idField('assignmentId', data.assignmentId);
  const assignment = await managedAssignment(store, caller, id, 'removeAssignment');
  await store.deleteAssignment(assignment);
  await store.audit({
    action: 'assign.remove',
    by: caller.uid,
    target: id,
    detail: { courseId: assignment.courseId, teamId: assignment.teamId, email: assignment.email },
  });
  log.info('Assignment removed', { assignmentId: id, courseId: assignment.courseId });
  return { assignmentId: id };
}
