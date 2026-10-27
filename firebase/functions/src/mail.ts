/**
 * Outgoing email. v1 queues messages in the `mail` collection (an outbox) and sends nothing:
 * the real sender needs credentials and is a later integration (.plan/13-open-questions.md, #4).
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

const SITE = 'https://nonstop-gurukul.web.app';

export const courseLink = (courseId: string): string =>
  `${SITE}/courses/${encodeURIComponent(courseId)}`;

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

/** A reminder for one incomplete assignment. */
export function buildReminderEmail(
  to: string,
  course: { id: string; title: string },
  dueAt: number | null,
): MailMessage {
  return {
    to,
    subject: `Reminder: ${course.title} is waiting for you`,
    text:
      `Hello,\n\nA quick reminder to continue "${course.title}" on NonStop Academy:\n\n` +
      `${courseLink(course.id)}\n${dueLine(dueAt)}\nIf you have already finished, you can ignore this note.\n`,
  };
}
