/**
 * Outgoing email: the messages and the `Mailer` port every function sends through. The sender
 * that delivers them (Gmail API, as gurukul@nonstopio.com) is in `gmail.ts`.
 */
export interface MailMessage {
  to: string;
  /** Copied recipients (`Cc:`); absent or empty for none. */
  cc?: string[];
  subject: string;
  text: string;
}

/** The port every function that wants to email someone uses. */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Used only when `SITE_URL` is unset; deploys set it (repository variable `SITE_URL`). */
const DEFAULT_SITE = 'https://nonstop-gurukul.web.app';

/** The public site address in links: `SITE_URL` when set (staging, previews), else production. */
const siteUrl = (): string => (process.env['SITE_URL'] || DEFAULT_SITE).replace(/\/+$/, '');

export const courseLink = (courseId: string): string =>
  `${siteUrl()}/courses/${encodeURIComponent(courseId)}`;

/** A due date as a plain, timezone-proof day, e.g. `12 Nov 2026`. */
export function formatDue(ms: number): string {
  return new Date(ms).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const dueLine = (dueAt: number | null): string =>
  dueAt === null ? '' : `\nPlease finish it by ${formatDue(dueAt)}.\n`;

/** One email for one person, listing every course they were just assigned. */
export function buildAssignedEmail(
  to: string,
  courses: readonly { id: string; title: string }[],
  dueAt: number | null,
): MailMessage {
  const list = courses.map((c) => `- ${c.title}: ${courseLink(c.id)}`).join('\n');
  const many = courses.length > 1;
  return {
    to,
    subject: many
      ? `You have ${courses.length} new courses on NonStop Academy`
      : `New course on NonStop Academy: ${courses.map((c) => c.title).join(', ')}`,
    text:
      `Hello,\n\nYou have been assigned ${many ? 'these courses' : 'a course'} on NonStop Academy:\n\n` +
      `${list}\n${dueLine(dueAt)}\nSign in with your NonStop io Google account to begin.\n`,
  };
}

/** One reminder for one person, listing every incomplete course it covers. */
export function buildReminderEmail(
  to: string,
  courses: readonly { id: string; title: string; dueAt: number | null }[],
): MailMessage {
  const course = courses.length === 1 ? courses[0] : undefined;
  if (course) {
    return {
      to,
      subject: `Reminder: ${course.title} is waiting for you`,
      text:
        `Hello,\n\nA quick reminder to continue "${course.title}" on NonStop Academy:\n\n` +
        `${courseLink(course.id)}\n${dueLine(course.dueAt)}\nIf you have already finished, you can ignore this note.\n`,
    };
  }
  const list = courses
    .map(
      (c) =>
        `- ${c.title}: ${courseLink(c.id)}${c.dueAt === null ? '' : ` (finish by ${formatDue(c.dueAt)})`}`,
    )
    .join('\n');
  return {
    to,
    subject: `Reminder: ${courses.length} courses are waiting for you`,
    text:
      `Hello,\n\nA quick reminder to continue these courses on NonStop Academy:\n\n${list}\n\n` +
      `If you have already finished, you can ignore this note.\n`,
  };
}

/** A course in an email, with its due date when it has one. */
interface DueCourse {
  id: string;
  title: string;
  dueAt: number | null;
}

const listOf = (courses: readonly DueCourse[], due: (ms: number) => string): string =>
  courses
    .map((c) => `- ${c.title}: ${courseLink(c.id)}${c.dueAt === null ? '' : ` (${due(c.dueAt)})`}`)
    .join('\n');

/**
 * The deadline email (`.plan/21-managers.md`): one person's overdue and due-soon courses first,
 * then anything else due a reminder that day. `cc` are the Managers of the teams those courses
 * were assigned through; the note says so when there are any.
 */
export function buildDeadlineEmail(
  to: string,
  courses: {
    overdue: readonly DueCourse[];
    dueSoon: readonly DueCourse[];
    others: readonly DueCourse[];
  },
  cc: readonly string[] = [],
): MailMessage {
  const { overdue, dueSoon, others } = courses;
  const late = overdue.length > 0;
  const urgent = [...overdue, ...dueSoon];
  const only = urgent.length === 1 ? urgent[0] : undefined;
  const subject = only
    ? `${late ? 'Overdue' : 'Due soon'}: ${only.title} on NonStop Academy`
    : late
      ? `${urgent.length} courses on NonStop Academy are overdue or due soon`
      : `${urgent.length} courses on NonStop Academy are due soon`;
  const sections = [
    late ? `Past the due date:\n\n${listOf(overdue, (ms) => `was due ${formatDue(ms)}`)}` : '',
    dueSoon.length > 0
      ? `Due soon:\n\n${listOf(dueSoon, (ms) => `finish by ${formatDue(ms)}`)}`
      : '',
    others.length > 0
      ? `Also waiting for you:\n\n${listOf(others, (ms) => `finish by ${formatDue(ms)}`)}`
      : '',
  ].filter((section) => section !== '');
  const copied =
    cc.length > 0
      ? 'Your team’s manager is copied on this note, so they know where you are.\n'
      : '';
  return {
    to,
    ...(cc.length > 0 ? { cc: [...cc] } : {}),
    subject,
    text:
      `Hello,\n\nA deadline is close or has passed for courses on NonStop Academy.\n\n` +
      `${sections.join('\n\n')}\n\n${copied}` +
      `If you have already finished, you can ignore this note.\n`,
  };
}

/** Where a learner writes to ask about a revoked certificate: replies reach this mailbox. */
export const CONTACT = 'gurukul@nonstopio.com';

/** Tells a learner their certificate for a course was revoked, and who to ask about it. */
export function buildRevokedEmail(to: string, courseTitle: string): MailMessage {
  return {
    to,
    subject: `Your certificate for ${courseTitle} was revoked`,
    text:
      `Hello,\n\nYour NonStop Academy certificate for "${courseTitle}" has been revoked. ` +
      `It no longer counts as valid, and its verification page now shows it as revoked.\n\n` +
      `If you think this is a mistake, write to ${CONTACT} and we will look into it.\n`,
  };
}
