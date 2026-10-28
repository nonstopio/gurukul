import { requireKulapati } from './errors.js';
import type { AuditEntry, Caller } from './errors.js';
import { log } from './logging/log.js';
import { buildReminderEmail } from './mail.js';
import type { Mailer } from './mail.js';
import { badCount, badField, missing } from './validation.js';

const DAY_MS = 86_400_000;
/**
 * Room for a scheduled run that starts a few seconds earlier than yesterday's reminder was stamped:
 * "reminded today" is the last 20 hours, and "a week since" is 7 days less the same 4 hours.
 */
const SLACK_MS = 4 * 3_600_000;
const RECENT_MS = DAY_MS - SLACK_MS;
export const MANUAL_CAP = 200;
export const SCHEDULED_CAP = 500;
const MAX_EMAILS = 1000;

/** The slice of an assignment document that reminders read, times in epoch milliseconds. */
export interface ReminderCandidate {
  id: string;
  email: string;
  courseId: string;
  status: 'assigned' | 'started' | 'completed';
  mandatory: boolean;
  reminder: 'weekly' | 'beforeDue' | 'none';
  assignedAt: number;
  dueAt: number | null;
  lastRemindedAt: number | null;
}

export interface Selection {
  /** One entry per person to email, with every assignment that one email covers. */
  due: { email: string; assignments: ReminderCandidate[] }[];
  /** People with a candidate assignment who get no email: reminded today, or over the cap. */
  skipped: number;
}

const incomplete = (c: ReminderCandidate): boolean => c.status !== 'completed';
const recentlyReminded = (c: ReminderCandidate, now: number): boolean =>
  c.lastRemindedAt !== null && now - c.lastRemindedAt < RECENT_MS;

/**
 * At most one email per person per day: a person any of whose `open` assignments was reminded
 * today gets nothing; everyone else gets one email for all their `eligible` assignments, up to
 * `cap` people. `considered` is who could have been reminded, for the skipped count.
 */
function perPerson(
  open: readonly ReminderCandidate[],
  considered: readonly ReminderCandidate[],
  eligible: readonly ReminderCandidate[],
  now: number,
  cap: number,
): Selection {
  const remindedToday = new Set(open.filter((c) => recentlyReminded(c, now)).map((c) => c.email));
  const people = new Map<string, ReminderCandidate[]>();
  for (const c of eligible) {
    if (!remindedToday.has(c.email)) people.set(c.email, [...(people.get(c.email) ?? []), c]);
  }
  const due = [...people].slice(0, cap).map(([email, assignments]) => ({ email, assignments }));
  return { due, skipped: new Set(considered.map((c) => c.email)).size - due.length };
}

/** A Kulapati asked: one email to each person with something unfinished, not reminded today. */
export function selectManual(
  candidates: readonly ReminderCandidate[],
  now: number,
  cap = MANUAL_CAP,
): Selection {
  const open = candidates.filter(incomplete);
  return perPerson(open, open, open, now, cap);
}

/**
 * The daily run, over incomplete mandatory assignments only. `weekly`: due 7 days after the last
 * reminder (the assignment date stands in before the first). `beforeDue`: the due date is within
 * 3 days, or past. `none` is never reminded. A person gets one email for everything due, and none
 * if anything of theirs was reminded today, by this run or by a Kulapati.
 */
export function selectScheduled(
  candidates: readonly ReminderCandidate[],
  now: number,
  cap = SCHEDULED_CAP,
): Selection {
  const open = candidates.filter(incomplete);
  const considered = open.filter((c) => c.mandatory && c.reminder !== 'none');
  const eligible = considered.filter((c) =>
    c.reminder === 'weekly'
      ? now - (c.lastRemindedAt ?? c.assignedAt) >= 7 * DAY_MS - SLACK_MS
      : c.dueAt !== null && c.dueAt - now <= 3 * DAY_MS,
  );
  return perPerson(open, considered, eligible, now, cap);
}

/** Where reminders read assignments and record that one was sent. `stores.ts` adapts the Admin SDK. */
export interface ReminderStore {
  /** Incomplete assignments of a course. */
  forCourse(courseId: string): Promise<ReminderCandidate[]>;
  /** Assignments (complete or not) of these emails. */
  forEmails(emails: string[]): Promise<ReminderCandidate[]>;
  /** Every incomplete assignment: the daily run needs all of a person's to know who was reminded today. */
  scheduled(): Promise<ReminderCandidate[]>;
  courseTitles(ids: string[]): Promise<Record<string, string | undefined>>;
  /** Stamps `lastRemindedAt` on each assignment. */
  markReminded(ids: string[]): Promise<void>;
  remindersEnabled(): Promise<boolean>;
  audit(entry: AuditEntry): Promise<void>;
}

async function deliver(store: ReminderStore, mailer: Mailer, due: Selection['due']): Promise<void> {
  const all = due.flatMap((p) => p.assignments);
  const titles = await store.courseTitles([...new Set(all.map((c) => c.courseId))]);
  for (const { email, assignments } of due) {
    await mailer.send(
      buildReminderEmail(
        email,
        assignments.map((c) => ({
          id: c.courseId,
          title: titles[c.courseId] ?? c.courseId,
          dueAt: c.dueAt,
        })),
      ),
    );
  }
  await store.markReminded(all.map((c) => c.id));
}

/**
 * `remindLearners`: nudge the people with an unfinished assignment of a course, or the given people.
 * `sent` and `skipped` count people, one email each.
 */
export async function remindLearners(
  deps: { store: ReminderStore; mailer: Mailer },
  caller: Caller,
  data: { courseId?: unknown; emails?: unknown },
  now: number,
): Promise<{ sent: number; skipped: number }> {
  requireKulapati(caller, 'remindLearners');
  const { courseId, emails } = data;
  const hasCourse = typeof courseId === 'string' && courseId !== '';
  const hasEmails = Array.isArray(emails);
  if (courseId !== undefined && !hasCourse) {
    throw badField('courseId', courseId, 'must be a non-empty course id');
  }
  if (emails !== undefined) {
    if (!hasEmails || !emails.every((e) => typeof e === 'string')) {
      throw badField('emails', emails, 'must be a list of email addresses');
    }
    if (emails.length < 1 || emails.length > MAX_EMAILS) {
      throw badCount('emails', `1 to ${MAX_EMAILS}`);
    }
  }
  if (!hasCourse && !hasEmails) throw missing('courseId or emails');
  log.debug('Selecting reminders', { courseId: hasCourse ? courseId : undefined });
  const { store } = deps;
  const wanted = hasEmails
    ? [...new Set((emails as string[]).map((e) => e.trim().toLowerCase()))]
    : [];
  const loaded = hasEmails
    ? await store.forEmails(wanted)
    : await store.forCourse(courseId as string);
  const candidates = hasCourse ? loaded.filter((c) => c.courseId === courseId) : loaded;
  const { due, skipped } = selectManual(candidates, now);
  if (due.length > 0) await deliver(store, deps.mailer, due);
  await store.audit({
    action: 'reminders.send',
    by: caller.uid,
    detail: { courseId: hasCourse ? courseId : null, sent: due.length, skipped },
  });
  log.info('Reminders queued', { count: due.length, skipped });
  return { sent: due.length, skipped };
}

/** The daily run behind `dailyReminders`; does nothing unless `config/org.reminders.enabled`. */
export async function runDailyReminders(
  deps: { store: ReminderStore; mailer: Mailer },
  now: number,
): Promise<{ sent: number; skipped: number }> {
  if (!(await deps.store.remindersEnabled())) return { sent: 0, skipped: 0 };
  const { due, skipped } = selectScheduled(await deps.store.scheduled(), now);
  if (due.length > 0) await deliver(deps.store, deps.mailer, due);
  return { sent: due.length, skipped };
}
