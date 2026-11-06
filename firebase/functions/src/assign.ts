import { createHmac } from 'node:crypto';
import {
  ApiException,
  EDUCATOR_COURSE_ID,
  EDUCATOR_TEAM_NAME,
  assignmentId,
  canOpen,
  classifyEmails,
  summarize,
} from '@gurukul/schema';
import type {
  AssignSummary,
  Audience,
  ClassifiedEmail,
  CourseAccess,
  Reminder,
} from '@gurukul/schema';
import { isAdmin, managesTeam, requireAdminOrManager } from './errors.js';
import type { AuditEntry, Caller, TeamRecord } from './errors.js';
import { log } from './logging/log.js';
import { buildAssignedEmail } from './mail.js';
import type { Mailer } from './mail.js';
import { badCount, badField, invalid } from './validation.js';

/** One assignment document to create; the adapter stamps `assignedBy`, `assignedByName`, `assignedAt` and `status`. */
export interface NewAssignment {
  id: string;
  email: string;
  uid: string | null;
  courseId: string;
  dueAt: number | null;
  mandatory: boolean;
  reminder: Reminder;
  /** The team it was assigned through (the first requested team listing the email), else null. */
  teamId: string | null;
}

/** Where `assignCourses` reads and writes. `stores.ts` adapts the Admin SDK. */
export interface AssignStore {
  /** Status and title of each course id; undefined for one that does not exist. */
  courses(
    ids: string[],
  ): Promise<Record<string, { status: unknown; title: string; access?: CourseAccess } | undefined>>;
  /** The teams that exist among these ids, by id. */
  teams(ids: string[]): Promise<Map<string, TeamRecord>>;
  /** Who may open which courses: teams and role of each signed-in person, by uid. */
  audiences(uids: string[]): Promise<Map<string, Audience>>;
  /** For each email that has a `users` doc, its uid. */
  signedInUsers(emails: string[]): Promise<Map<string, string>>;
  /** The `displayName` on the person's `users` doc, or null when there is none. */
  profileName(uid: string): Promise<string | null>;
  /** Which of these assignment ids already exist. */
  existingAssignmentIds(ids: string[]): Promise<Set<string>>;
  /**
   * Creates the documents (never overwrites), in batches. A batch that fails does not stop the
   * others: the ids of the documents it held are returned so the caller can report them.
   */
  createAssignments(
    assignedBy: string,
    assignedByName: string | null,
    docs: NewAssignment[],
  ): Promise<string[]>;
  /** Adds to `stats/course_{id}.assigned` and `stats/org.assignmentsTotal`. */
  bumpAssigned(perCourse: Record<string, number>): Promise<void>;
  audit(entry: AuditEntry): Promise<void>;
  /** Adds the emails to the team named `name` (`teams/{teamId(name)}`), creating it when missing. */
  addTeamMembers(name: string, emails: string[]): Promise<void>;
}

export interface AssignResult {
  summary: AssignSummary;
  assigned: number;
  notified: number;
  /** (course, email) pairs that could not be written; empty when everything was. */
  failed: { email: string; courseId: string }[];
}

/**
 * The name learners see as who assigned their course: the token's Google name, else the caller's
 * profile `displayName` (read only when the token has none), else null.
 */
async function assignerName(store: AssignStore, caller: Caller): Promise<string | null> {
  return caller.name?.trim() || (await store.profileName(caller.uid))?.trim() || null;
}

export const MAX_COURSES = 20;
export const MAX_EMAILS = 1000;
export const MAX_TEAMS = 20;

/**
 * A stable, non-reversible key for an email, used only inside an assignment document id. It is an
 * identifier, not a credential, so a keyed hash (the fixed key is domain separation, not a secret)
 * is the right tool and a slow password hash would only cost time.
 */
export const emailKey = (email: string): string =>
  createHmac('sha256', 'gurukul-assignment-id').update(email).digest('hex');

interface AssignRequest {
  courseIds: string[];
  /** Exactly one of `emails` and `teamIds` is non-null. */
  emails: string[] | null;
  teamIds: string[] | null;
  dueAt: number | null;
  mandatory: boolean;
  reminder: Reminder;
  notify: boolean;
}

const isStrings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

/** Checks the shape of the request; the first bad field is a `VAL_100x` `ApiException`. */
export function parseAssignRequest(data: Record<string, unknown>): AssignRequest {
  const { courseIds, emails, teamIds, dueAt, mandatory, reminder, notify } = data;
  if (!isStrings(courseIds)) throw badField('courseIds', courseIds, 'must be a list of course ids');
  if (courseIds.length < 1 || courseIds.length > MAX_COURSES) {
    throw badCount('courseIds', `1 to ${MAX_COURSES}`);
  }
  if (emails !== undefined && teamIds !== undefined) {
    throw invalid('teamIds', 'send emails or teamIds, not both');
  }
  if (teamIds !== undefined) {
    if (!isStrings(teamIds) || teamIds.some((id) => id === '' || id.includes('/'))) {
      throw badField('teamIds', teamIds, 'must be a list of team ids');
    }
    if (teamIds.length < 1 || teamIds.length > MAX_TEAMS) {
      throw badCount('teamIds', `1 to ${MAX_TEAMS}`);
    }
  } else {
    if (!isStrings(emails)) throw badField('emails', emails, 'must be a list of email addresses');
    if (emails.length < 1 || emails.length > MAX_EMAILS) {
      throw badCount('emails', `1 to ${MAX_EMAILS}`);
    }
  }
  if (courseIds.some((id) => id === '' || id.includes('/'))) {
    throw badField('courseIds', courseIds, 'a course id is empty or contains "/"');
  }
  if (dueAt !== null && (typeof dueAt !== 'number' || !Number.isFinite(dueAt))) {
    throw badField('dueAt', dueAt, 'must be a time in milliseconds, or null');
  }
  if (typeof mandatory !== 'boolean')
    throw badField('mandatory', mandatory, 'must be true or false');
  if (typeof notify !== 'boolean') throw badField('notify', notify, 'must be true or false');
  if (reminder !== 'weekly' && reminder !== 'beforeDue' && reminder !== 'none') {
    throw badField('reminder', reminder, 'must be weekly, beforeDue or none');
  }
  return {
    courseIds: [...new Set(courseIds)],
    emails: teamIds === undefined ? (emails as string[]) : null,
    teamIds: teamIds === undefined ? null : [...new Set(teamIds as string[])],
    dueAt,
    mandatory,
    reminder,
    notify,
  };
}

/**
 * The people on the requested teams, in order, and for each email the first requested team that
 * lists it. Unknown team: `VAL_1003`; a team the caller does not manage: `AUTH_2001`.
 */
async function teamAudience(
  store: AssignStore,
  caller: Caller,
  ids: string[],
): Promise<{ emails: string[]; teamOf: Map<string, string> }> {
  const teams = await store.teams(ids);
  const teamOf = new Map<string, string>();
  for (const id of ids) {
    const team = teams.get(id);
    if (team === undefined) throw new ApiException('VAL_1003', ['team', id], { field: 'teamIds' });
    if (!managesTeam(caller, team)) {
      throw new ApiException('AUTH_2001', ['assignCourses'], { teamId: id });
    }
    for (const raw of team.memberEmails) {
      const email = raw.trim().toLowerCase();
      if (!teamOf.has(email)) teamOf.set(email, id);
    }
  }
  if (teamOf.size > MAX_EMAILS) throw badCount('teamIds', `teams with 1 to ${MAX_EMAILS} people`);
  return { emails: [...teamOf.keys()], teamOf };
}

/**
 * `assignCourses`: assigns every course to every valid email. Rejected addresses are reported and
 * skipped; an assignment that already exists is never overwritten. The summary counts (course,
 * email) pairs, so assigning 2 courses to 3 new people reports 6, and lists rejections once.
 */
export async function assignCourses(
  deps: { store: AssignStore; mailer: Mailer },
  caller: Caller,
  data: Record<string, unknown>,
): Promise<AssignResult> {
  requireAdminOrManager(caller, 'assignCourses');
  const admin = isAdmin(caller);
  const req = parseAssignRequest(data);
  // A Manager assigns to the teams they manage, never to addresses of their choosing.
  if (!admin && req.teamIds === null) {
    throw new ApiException('AUTH_2001', ['assignCourses'], { field: 'emails' });
  }
  // An assignment due before it is made is overdue on day one: refuse it.
  if (req.dueAt !== null && req.dueAt < Date.now()) {
    throw badField('dueAt', req.dueAt, 'must not be in the past');
  }
  const { store } = deps;
  const { emails, teamOf } =
    req.teamIds === null
      ? { emails: req.emails as string[], teamOf: new Map<string, string>() }
      : await teamAudience(store, caller, req.teamIds);
  log.debug('Assigning courses', { count: emails.length, courseCount: req.courseIds.length });

  const found = await store.courses(req.courseIds);
  const titles = new Map<string, string>();
  const access = new Map<string, CourseAccess | undefined>();
  for (const id of req.courseIds) {
    const course = found[id];
    if (course === undefined) throw new ApiException('CRS_2001', [id]);
    if (course.status !== 'published') throw new ApiException('CRS_1001', [id]);
    // A Manager hands out what any learner may take: not staff-only courses, and never the
    // Educator course (finishing it makes someone an Educator).
    if (!admin && (id === EDUCATOR_COURSE_ID || course.access?.visibility === 'staff')) {
      throw new ApiException('AUTH_2001', ['assignCourses'], { courseId: id });
    }
    titles.set(id, course.title);
    access.set(id, course.access);
  }

  const first = classifyEmails(emails, { signedIn: new Set(), assigned: new Set() });
  const valid = first.filter((c) => c.status !== 'rejected').map((c) => c.email);
  const users = await store.signedInUsers(valid);
  const signedIn = new Set(users.keys());

  const summary: AssignSummary = {
    signedIn: 0,
    newInvites: 0,
    alreadyAssigned: 0,
    rejected: summarize(first).rejected,
  };
  // A course limited to teams or to staff is not offered to a signed-in person it would not open
  // for: they would get an email with a dead link. Someone not signed in yet has no profile to
  // check, so they are assigned and the course opens for them if their team lists them.
  const restricted = req.courseIds.some(
    (id) => (access.get(id)?.visibility ?? 'public') !== 'public',
  );
  const audiences = restricted
    ? await store.audiences([...users.values()])
    : new Map<string, Audience>();
  const refused: { email: string; courseId: string }[] = [];
  const candidates: string[] = [];
  const docs: NewAssignment[] = [];
  const newByEmail = new Map<string, { id: string; title: string }[]>();
  for (const courseId of req.courseIds) {
    const rule = access.get(courseId);
    const mayOpen = (email: string): boolean => {
      const uid = users.get(email);
      const who = uid === undefined ? undefined : audiences.get(uid);
      // Assigning the Educator course is what lets someone open it: they join its team below.
      if (courseId === EDUCATOR_COURSE_ID) return true;
      return rule === undefined || who === undefined || canOpen(rule, who);
    };
    const allowed = valid.filter(mayOpen);
    if (courseId === EDUCATOR_COURSE_ID) candidates.push(...allowed);
    refused.push(...valid.filter((e) => !mayOpen(e)).map((email) => ({ email, courseId })));
    const ids = new Map(allowed.map((email) => [assignmentId(courseId, emailKey(email)), email]));
    const existing = await store.existingAssignmentIds([...ids.keys()]);
    const assigned = new Set([...ids].filter(([id]) => existing.has(id)).map(([, email]) => email));
    const classified: ClassifiedEmail[] = classifyEmails(allowed, { signedIn, assigned });
    const part = summarize(classified);
    summary.signedIn += part.signedIn;
    summary.newInvites += part.newInvites;
    summary.alreadyAssigned += part.alreadyAssigned;
    const fresh = classified.filter((c) => c.status !== 'alreadyAssigned');
    for (const { email } of fresh) {
      docs.push({
        id: assignmentId(courseId, emailKey(email)),
        email,
        uid: users.get(email) ?? null,
        courseId,
        dueAt: req.dueAt,
        mandatory: req.mandatory,
        reminder: req.reminder,
        teamId: teamOf.get(email) ?? null,
      });
      newByEmail.set(email, [
        ...(newByEmail.get(email) ?? []),
        { id: courseId, title: titles.get(courseId) as string },
      ]);
    }
  }

  const failedIds = new Set(
    docs.length > 0
      ? await store.createAssignments(caller.uid, await assignerName(store, caller), docs)
      : [],
  );
  const created = docs.filter((d) => !failedIds.has(d.id));
  const failed = [
    ...docs
      .filter((d) => failedIds.has(d.id))
      .map((d) => ({ email: d.email, courseId: d.courseId })),
    ...refused,
  ];
  // Everyone it is (re)assigned to, not only new assignments: assigning again puts back someone
  // taken off the team, or left off it by a failed earlier call. Adding is idempotent.
  if (candidates.length > 0) await store.addTeamMembers(EDUCATOR_TEAM_NAME, candidates);
  if (created.length > 0) {
    const written: Record<string, number> = {};
    for (const d of created) written[d.courseId] = (written[d.courseId] ?? 0) + 1;
    await store.bumpAssigned(written);
  }
  await store.audit({
    action: 'assign',
    by: caller.uid,
    detail: {
      courseIds: req.courseIds,
      ...(req.teamIds === null ? {} : { teamIds: req.teamIds }),
      count: created.length,
      emails: [...new Set(created.map((d) => d.email))],
    },
  });

  let notified = 0;
  if (req.notify) {
    for (const [email, courses] of newByEmail) {
      const got = courses.filter((c) => !failedIds.has(assignmentId(c.id, emailKey(email))));
      if (got.length === 0) continue;
      // The assignments are already saved: a mail failure must not turn the call into a failure,
      // or a retry would find everything "already assigned" and tell nobody.
      try {
        await deps.mailer.send(buildAssignedEmail(email, got, req.dueAt));
        notified += 1;
      } catch {
        log.warn('Assignment email failed', { count: got.length });
      }
    }
  }
  log.info('Courses assigned', {
    count: created.length,
    failed: failed.length,
    courseCount: req.courseIds.length,
    notified,
  });
  return { summary, assigned: created.length, notified, failed };
}
