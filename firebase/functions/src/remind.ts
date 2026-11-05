import { ApiException } from '@gurukul/schema';
import { isAdmin, managesTeam, requireAdminOrManager } from './errors.js';
import type { AuditEntry, Caller, TeamRecord } from './errors.js';
import { log } from './logging/log.js';
import { buildDeadlineEmail, buildReminderEmail } from './mail.js';
import type { Mailer } from './mail.js';
import { badCount, badField, idField, missing } from './validation.js';

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
/** The due-soon notice goes out once the due date is this close (and not past). */
export const DUE_SOON_MS = 5 * DAY_MS;
/** The most people one deadline email copies. */
export const MAX_CC = 10;

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
  /** The team it was assigned through, whose Managers a deadline email copies; null for none. */
  teamId: string | null;
  dueSoonSentAt: number | null;
  overdueSentAt: number | null;
}

/** A once-only deadline notice an assignment owes. */
export type Notice = 'dueSoon' | 'overdue';

/** One person to email and every assignment that one email covers. */
export interface PersonDue {
  email: string;
  assignments: ReminderCandidate[];
  /** The notices owed, by assignment id; empty for a plain reminder. */
  notices: Record<string, Notice>;
}

export interface Selection {
  /** One entry per person to email. */
  due: PersonDue[];
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
  const due = [...people]
    .slice(0, cap)
    .map(([email, assignments]) => ({ email, assignments, notices: {} }));
  return { due, skipped: new Set(considered.map((c) => c.email)).size - due.length };
}

/** An Admin asked: one email to each person with something unfinished, not reminded today. */
export function selectManual(
  candidates: readonly ReminderCandidate[],
  now: number,
  cap = MANUAL_CAP,
): Selection {
  const open = candidates.filter(incomplete);
  return perPerson(open, open, open, now, cap);
}

/**
 * The once-only deadline notice an incomplete assignment with a due date owes today, mandatory or
 * not, unless its reminder is `none`: `overdue` once the due date has passed, `dueSoon` when it is 5
 * days away or less. Each is owed until its stamp is set; a new due date clears both.
 */
export function noticeFor(c: ReminderCandidate, now: number): Notice | null {
  if (!incomplete(c) || c.reminder === 'none' || c.dueAt === null) return null;
  if (c.dueAt <= now) return c.overdueSentAt === null ? 'overdue' : null;
  return c.dueAt - now <= DUE_SOON_MS && c.dueSoonSentAt === null ? 'dueSoon' : null;
}

/** Whether a mandatory assignment's own cadence makes it due today. */
const cadenceDue = (c: ReminderCandidate, now: number): boolean =>
  c.mandatory &&
  (c.reminder === 'weekly'
    ? now - (c.lastRemindedAt ?? c.assignedAt) >= 7 * DAY_MS - SLACK_MS
    : c.reminder === 'beforeDue' && c.dueAt !== null && c.dueAt - now <= 3 * DAY_MS);

/**
 * The daily run. Mandatory assignments follow their cadence: `weekly` is due 7 days after the last
 * reminder (the assignment date stands in before the first), `beforeDue` when the due date is
 * within 3 days, or past; `none` is never reminded. On top, any assignment that owes a deadline
 * notice (`noticeFor`) is due. A person gets one email for everything due, and none if anything of
 * theirs was reminded today, by this run or by an Admin: a notice then waits for tomorrow.
 */
export function selectScheduled(
  candidates: readonly ReminderCandidate[],
  now: number,
  cap = SCHEDULED_CAP,
): Selection {
  const open = candidates.filter(incomplete);
  const considered = open.filter(
    (c) => (c.mandatory && c.reminder !== 'none') || noticeFor(c, now) !== null,
  );
  const eligible = considered.filter((c) => cadenceDue(c, now) || noticeFor(c, now) !== null);
  const selection = perPerson(open, considered, eligible, now, cap);
  for (const person of selection.due) {
    for (const c of person.assignments) {
      const notice = noticeFor(c, now);
      if (notice !== null) person.notices[c.id] = notice;
    }
  }
  return selection;
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
  /** Stamps `dueSoonSentAt` or `overdueSentAt` on each assignment, as named. */
  markNoticed(notices: Record<string, Notice>): Promise<void>;
  /** The current `managerEmails` of each existing team among these ids (lower-cased). */
  teamManagers(teamIds: string[]): Promise<Record<string, string[]>>;
  /** The team, or undefined when there is none with that id. */
  team(teamId: string): Promise<TeamRecord | undefined>;
  remindersEnabled(): Promise<boolean>;
  audit(entry: AuditEntry): Promise<void>;
}

/** The teams a person's notice assignments came through. */
const noticeTeamIds = (person: PersonDue): string[] =>
  person.assignments
    .filter((c) => person.notices[c.id] !== undefined && c.teamId !== null)
    .map((c) => c.teamId as string);

/**
 * Who a deadline email copies: the current Managers of the teams its notice assignments came
 * through, deduped, without the learner, at most `MAX_CC`. An assignment with no team copies nobody.
 */
export function ccFor(
  person: PersonDue,
  managers: Readonly<Record<string, readonly string[]>>,
): string[] {
  const cc = new Set(noticeTeamIds(person).flatMap((id) => managers[id] ?? []));
  cc.delete(person.email);
  return [...cc].slice(0, MAX_CC);
}

async function deliver(store: ReminderStore, mailer: Mailer, due: PersonDue[]): Promise<void> {
  const all = due.flatMap((p) => p.assignments);
  const titles = await store.courseTitles([...new Set(all.map((c) => c.courseId))]);
  // Read when sending, so a handover made since the assignment applies at once.
  const noticeTeams = [...new Set(due.flatMap(noticeTeamIds))];
  const managers = noticeTeams.length > 0 ? await store.teamManagers(noticeTeams) : {};
  const course = (c: ReminderCandidate) => ({
    id: c.courseId,
    title: titles[c.courseId] ?? c.courseId,
    dueAt: c.dueAt,
  });
  // Stamp only the people actually emailed, even if a later send fails: otherwise the next run
  // mails the earlier ones again and the one-email-a-day limit means nothing.
  const sent: string[] = [];
  const noticed: Record<string, Notice> = {};
  try {
    for (const person of due) {
      const { email, assignments, notices } = person;
      const of = (notice: Notice) => assignments.filter((c) => notices[c.id] === notice);
      const message =
        Object.keys(notices).length === 0
          ? buildReminderEmail(email, assignments.map(course))
          : buildDeadlineEmail(
              email,
              {
                overdue: of('overdue').map(course),
                dueSoon: of('dueSoon').map(course),
                others: assignments.filter((c) => notices[c.id] === undefined).map(course),
              },
              ccFor(person, managers),
            );
      await mailer.send(message);
      sent.push(...assignments.map((c) => c.id));
      Object.assign(noticed, notices);
    }
  } finally {
    if (sent.length > 0) await store.markReminded(sent);
    if (Object.keys(noticed).length > 0) await store.markNoticed(noticed);
  }
}

/**
 * `remindLearners`: nudge the people with an unfinished assignment of a course, or the given people,
 * or a team's people. With `teamId` only that team's members are reminded: a Manager must pass a
 * team they manage; an Admin may pass one to narrow. `sent` and `skipped` count people, one email
 * each.
 */
export async function remindLearners(
  deps: { store: ReminderStore; mailer: Mailer },
  caller: Caller,
  data: { courseId?: unknown; emails?: unknown; teamId?: unknown },
  now: number,
): Promise<{ sent: number; skipped: number }> {
  requireAdminOrManager(caller, 'remindLearners');
  const { courseId, emails } = data;
  const teamId = data.teamId === undefined ? undefined : idField('teamId', data.teamId);
  if (teamId === undefined && !isAdmin(caller)) {
    throw new ApiException('AUTH_2001', ['remindLearners'], { field: 'teamId' });
  }
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
  if (!hasCourse && !hasEmails && teamId === undefined) {
    throw missing('courseId, emails or teamId');
  }
  log.debug('Selecting reminders', { courseId: hasCourse ? courseId : undefined, teamId });
  const { store } = deps;
  const members = teamId === undefined ? null : await teamMembers(store, caller, teamId);
  const asked = hasEmails
    ? [...new Set((emails as string[]).map((e) => e.trim().toLowerCase()))]
    : null;
  const wanted =
    members === null ? asked : asked === null ? members : asked.filter((e) => members.includes(e));
  const loaded =
    wanted === null
      ? await store.forCourse(courseId as string)
      : wanted.length === 0
        ? []
        : await store.forEmails(wanted);
  const candidates = hasCourse ? loaded.filter((c) => c.courseId === courseId) : loaded;
  const { due, skipped } = selectManual(candidates, now);
  if (due.length > 0) await deliver(store, deps.mailer, due);
  await store.audit({
    action: 'reminders.send',
    by: caller.uid,
    detail: {
      courseId: hasCourse ? courseId : null,
      ...(teamId === undefined ? {} : { teamId }),
      sent: due.length,
      skipped,
    },
  });
  log.info('Reminders queued', { count: due.length, skipped });
  return { sent: due.length, skipped };
}

/** A team's members (lower-cased), once the caller is known to manage it (`AUTH_2001` if not). */
async function teamMembers(store: ReminderStore, caller: Caller, id: string): Promise<string[]> {
  const team = await store.team(id);
  if (team === undefined) throw new ApiException('VAL_1003', ['team', id], { field: 'teamId' });
  if (!managesTeam(caller, team)) {
    throw new ApiException('AUTH_2001', ['remindLearners'], { teamId: id });
  }
  return [...new Set(team.memberEmails.map((e) => e.trim().toLowerCase()))];
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
