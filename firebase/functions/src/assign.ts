import { createHmac } from 'node:crypto';
import { ApiException, assignmentId, classifyEmails, summarize } from '@gurukul/schema';
import type { AssignSummary, ClassifiedEmail, Reminder } from '@gurukul/schema';
import { requireKulapati } from './errors.js';
import type { AuditEntry, Caller } from './errors.js';
import { log } from './logging/log.js';
import { buildAssignedEmail } from './mail.js';
import type { Mailer } from './mail.js';
import { badCount, badField } from './validation.js';

/** One assignment document to create; the adapter stamps `assignedBy`, `assignedAt` and `status`. */
export interface NewAssignment {
  id: string;
  email: string;
  uid: string | null;
  courseId: string;
  dueAt: number | null;
  mandatory: boolean;
  reminder: Reminder;
}

/** Where `assignCourses` reads and writes. `stores.ts` adapts the Admin SDK. */
export interface AssignStore {
  /** Status and title of each course id; undefined for one that does not exist. */
  courses(ids: string[]): Promise<Record<string, { status: unknown; title: string } | undefined>>;
  /** For each email that has a `users` doc, its uid. */
  signedInUsers(emails: string[]): Promise<Map<string, string>>;
  /** Which of these assignment ids already exist. */
  existingAssignmentIds(ids: string[]): Promise<Set<string>>;
  /** Creates the documents (never overwrites), in batches. */
  createAssignments(assignedBy: string, docs: NewAssignment[]): Promise<void>;
  /** Adds to `stats/course_{id}.assigned` and `stats/org.assignmentsTotal`. */
  bumpAssigned(perCourse: Record<string, number>): Promise<void>;
  audit(entry: AuditEntry): Promise<void>;
}

export interface AssignResult {
  summary: AssignSummary;
  assigned: number;
  notified: number;
}

export const MAX_COURSES = 20;
export const MAX_EMAILS = 1000;

/**
 * A stable, non-reversible key for an email, used only inside an assignment document id. It is an
 * identifier, not a credential, so a keyed hash (the fixed key is domain separation, not a secret)
 * is the right tool and a slow password hash would only cost time.
 */
export const emailKey = (email: string): string =>
  createHmac('sha256', 'gurukul-assignment-id').update(email).digest('hex');

interface AssignRequest {
  courseIds: string[];
  emails: string[];
  dueAt: number | null;
  mandatory: boolean;
  reminder: Reminder;
  notify: boolean;
}

const isStrings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

/** Checks the shape of the request; the first bad field is a `VAL_100x` `ApiException`. */
export function parseAssignRequest(data: Record<string, unknown>): AssignRequest {
  const { courseIds, emails, dueAt, mandatory, reminder, notify } = data;
  if (!isStrings(courseIds)) throw badField('courseIds', courseIds, 'must be a list of course ids');
  if (courseIds.length < 1 || courseIds.length > MAX_COURSES) {
    throw badCount('courseIds', `1 to ${MAX_COURSES}`);
  }
  if (!isStrings(emails)) throw badField('emails', emails, 'must be a list of email addresses');
  if (emails.length < 1 || emails.length > MAX_EMAILS) {
    throw badCount('emails', `1 to ${MAX_EMAILS}`);
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
  return { courseIds: [...new Set(courseIds)], emails, dueAt, mandatory, reminder, notify };
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
  requireKulapati(caller, 'assignCourses');
  const req = parseAssignRequest(data);
  const { store } = deps;
  log.debug('Assigning courses', { count: req.emails.length, courseCount: req.courseIds.length });

  const found = await store.courses(req.courseIds);
  const titles = new Map<string, string>();
  for (const id of req.courseIds) {
    const course = found[id];
    if (course === undefined) throw new ApiException('CRS_2001', [id]);
    if (course.status !== 'published') throw new ApiException('CRS_1001', [id]);
    titles.set(id, course.title);
  }

  const first = classifyEmails(req.emails, { signedIn: new Set(), assigned: new Set() });
  const valid = first.filter((c) => c.status !== 'rejected').map((c) => c.email);
  const users = await store.signedInUsers(valid);
  const signedIn = new Set(users.keys());

  const summary: AssignSummary = {
    signedIn: 0,
    newInvites: 0,
    alreadyAssigned: 0,
    rejected: summarize(first).rejected,
  };
  const docs: NewAssignment[] = [];
  const perCourse: Record<string, number> = {};
  const newByEmail = new Map<string, { id: string; title: string }[]>();
  for (const courseId of req.courseIds) {
    const ids = new Map(valid.map((email) => [assignmentId(courseId, emailKey(email)), email]));
    const existing = await store.existingAssignmentIds([...ids.keys()]);
    const assigned = new Set([...ids].filter(([id]) => existing.has(id)).map(([, email]) => email));
    const classified: ClassifiedEmail[] = classifyEmails(valid, { signedIn, assigned });
    const part = summarize(classified);
    summary.signedIn += part.signedIn;
    summary.newInvites += part.newInvites;
    summary.alreadyAssigned += part.alreadyAssigned;
    const fresh = classified.filter((c) => c.status !== 'alreadyAssigned');
    perCourse[courseId] = fresh.length;
    for (const { email } of fresh) {
      docs.push({
        id: assignmentId(courseId, emailKey(email)),
        email,
        uid: users.get(email) ?? null,
        courseId,
        dueAt: req.dueAt,
        mandatory: req.mandatory,
        reminder: req.reminder,
      });
      newByEmail.set(email, [
        ...(newByEmail.get(email) ?? []),
        { id: courseId, title: titles.get(courseId) as string },
      ]);
    }
  }

  if (docs.length > 0) {
    await store.createAssignments(caller.uid, docs);
    await store.bumpAssigned(perCourse);
  }
  await store.audit({
    action: 'assign',
    by: caller.uid,
    detail: { courseIds: req.courseIds, count: docs.length },
  });

  let notified = 0;
  if (req.notify) {
    for (const [email, courses] of newByEmail) {
      await deps.mailer.send(buildAssignedEmail(email, courses, req.dueAt));
      notified += 1;
    }
  }
  log.info('Courses assigned', {
    count: docs.length,
    courseCount: req.courseIds.length,
    notified,
  });
  return { summary, assigned: docs.length, notified };
}
