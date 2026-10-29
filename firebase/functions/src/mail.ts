/**
 * Outgoing email: the messages and the `Mailer` port every function sends through. The sender
 * that delivers them (Gmail API, as gurukul@nonstopio.com) is in `gmail.ts`.
 */
export interface MailMessage {
  to: string;
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
