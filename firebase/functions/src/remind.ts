import { requireKulapati } from './errors.js';
import type { AuditEntry, Caller } from './errors.js';
import { log } from './logging/log.js';
import { buildReminderEmail } from './mail.js';
import type { Mailer } from './mail.js';
import { badCount, badField, missing } from './validation.js';

const DAY_MS = 86_400_000;
export const MANUAL_CAP = 200;
export const SCHEDULED_CAP = 500;
const MAX_EMAILS = 1000;

/** The slice of an assignment document that reminders read, times in epoch milliseconds. */
export interface ReminderCandidate {
  id: string;
  email: string;
  courseId: string;
  status: 'assigned' | 'started' | 'completed';
  reminder: 'weekly' | 'beforeDue' | 'none';
  assignedAt: number;
  dueAt: number | null;
  lastRemindedAt: number | null;
}

export interface Selection {
  due: ReminderCandidate[];
  /** Incomplete assignments that were not reminded: too recent, or over the cap. */
  skipped: number;
}

const incomplete = (c: ReminderCandidate): boolean => c.status !== 'completed';
const recentlyReminded = (c: ReminderCandidate, now: number): boolean =>
  c.lastRemindedAt !== null && now - c.lastRemindedAt < DAY_MS;

function capped(eligible: ReminderCandidate[], total: number, cap: number): Selection {
  const due = eligible.slice(0, cap);
  return { due, skipped: total - due.length };
}

/** A Kulapati asked: every incomplete assignment not reminded in the last 24 hours, up to `cap`. */
export function selectManual(
  candidates: readonly ReminderCandidate[],
  now: number,
  cap = MANUAL_CAP,
): Selection {
  const open = candidates.filter(incomplete);
  return capped(
    open.filter((c) => !recentlyReminded(c, now)),
    open.length,
    cap,
  );
}

/**
 * The daily run. `weekly`: a reminder is due 7 days after the last one (the assignment date
 * stands in before the first). `beforeDue`: the due date is within 3 days (or past) and nobody
 * reminded in the last 24 hours. `none` and completed assignments are never reminded.
 */
export function selectScheduled(
  candidates: readonly ReminderCandidate[],
  now: number,
  cap = SCHEDULED_CAP,
): Selection {
  const open = candidates.filter((c) => incomplete(c) && c.reminder !== 'none');
  const eligible = open.filter((c) =>
    c.reminder === 'weekly'
      ? now - (c.lastRemindedAt ?? c.assignedAt) >= 7 * DAY_MS
      : c.dueAt !== null && c.dueAt - now <= 3 * DAY_MS && !recentlyReminded(c, now),
  );
  return capped(eligible, open.length, cap);
}

/** Where reminders read assignments and record that one was sent. `stores.ts` adapts the Admin SDK. */
export interface ReminderStore {
  /** Incomplete assignments of a course. */
  forCourse(courseId: string): Promise<ReminderCandidate[]>;
  /** Assignments (complete or not) of these emails. */
  forEmails(emails: string[]): Promise<ReminderCandidate[]>;
  /** Incomplete assignments whose reminder is `weekly` or `beforeDue`. */
  scheduled(): Promise<ReminderCandidate[]>;
  courseTitles(ids: string[]): Promise<Record<string, string | undefined>>;
  /** Stamps `lastRemindedAt` on each assignment. */
  markReminded(ids: string[]): Promise<void>;
  remindersEnabled(): Promise<boolean>;
  audit(entry: AuditEntry): Promise<void>;
}

async function deliver(
  store: ReminderStore,
  mailer: Mailer,
  due: ReminderCandidate[],
): Promise<void> {
  const titles = await store.courseTitles([...new Set(due.map((c) => c.courseId))]);
  for (const c of due) {
    await mailer.send(
      buildReminderEmail(
        c.email,
        { id: c.courseId, title: titles[c.courseId] ?? c.courseId },
        c.dueAt,
      ),
    );
  }
  await store.markReminded(due.map((c) => c.id));
}

/** `remindLearners`: nudge the people with an unfinished assignment of a course, or the given people. */
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
