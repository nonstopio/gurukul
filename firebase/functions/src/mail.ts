import {
  CONTACT,
  callout,
  courseCard,
  emailLayout,
  paragraph,
  sectionLabel,
  siteUrl,
} from './mail-html.js';

/**
 * Outgoing email: the messages and the `Mailer` port every function sends through. The sender
 * that delivers them (Gmail API, as gurukul@nonstopio.com) is in `gmail.ts`; the HTML layout is
 * in `mail-html.ts`.
 */
export interface MailMessage {
  to: string;
  /** Copied recipients (`Cc:`); absent or empty for none. */
  cc?: string[];
  subject: string;
  /** The plain-text alternative. */
  text: string;
  /** The designed email, for clients that show HTML. */
  html: string;
}

/** The port every function that wants to email someone uses. */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

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

const finishBy = (ms: number): string => `Finish by ${formatDue(ms)}`;

/** The one button: that course when there is exactly one, else the site. */
const openCta = (
  courses: readonly { id: string }[],
  one: string,
): { label: string; href: string } => {
  const only = courses.length === 1 ? courses[0] : undefined;
  return only
    ? { label: one, href: courseLink(only.id) }
    : { label: 'Open NonStop Gurukul', href: siteUrl() };
};

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
  const subject = many
    ? `You have ${courses.length} new courses on NonStop Gurukul`
    : `New course on NonStop Gurukul: ${courses.map((c) => c.title).join(', ')}`;
  const intro = `You have been assigned ${many ? 'these courses' : 'a course'}. Sign in with your NonStop io Google account to begin.`;
  return {
    to,
    subject,
    html: emailLayout({
      subject,
      preheader: many ? `${courses.length} new courses are waiting for you.` : intro,
      eyebrow: 'New course',
      title: many ? 'You have new courses' : 'You have a new course',
      intro,
      body: courses
        .map((c) =>
          courseCard({
            title: c.title,
            href: courseLink(c.id),
            ...(dueAt === null ? {} : { due: finishBy(dueAt) }),
          }),
        )
        .join(''),
      cta: openCta(courses, 'Start course'),
      reason: 'You are receiving this because a course was assigned to you.',
    }),
    text:
      `Hello,\n\nYou have been assigned ${many ? 'these courses' : 'a course'} on NonStop Gurukul:\n\n` +
      `${list}\n${dueLine(dueAt)}\nSign in with your NonStop io Google account to begin.\n`,
  };
}

const reminderHtml = (
  subject: string,
  courses: readonly { id: string; title: string; dueAt: number | null }[],
  one: string,
): string =>
  emailLayout({
    subject,
    preheader: 'A quick reminder to pick up where you left off.',
    eyebrow: 'Reminder',
    title: courses.length === 1 ? 'Your course is waiting' : 'Your courses are waiting',
    intro:
      'A quick reminder to continue on NonStop Gurukul. If you have already finished, you can ignore this note.',
    body: courses
      .map((c) =>
        courseCard({
          title: c.title,
          href: courseLink(c.id),
          ...(c.dueAt === null ? {} : { due: finishBy(c.dueAt) }),
        }),
      )
      .join(''),
    cta: openCta(courses, one),
    reason: 'You are receiving this because a course you have not finished is waiting for you.',
  });

/** One reminder for one person, listing every incomplete course it covers. */
export function buildReminderEmail(
  to: string,
  courses: readonly { id: string; title: string; dueAt: number | null }[],
): MailMessage {
  const course = courses.length === 1 ? courses[0] : undefined;
  if (course) {
    const subject = `Reminder: ${course.title} is waiting for you`;
    return {
      to,
      subject,
      html: reminderHtml(subject, courses, 'Continue course'),
      text:
        `Hello,\n\nA quick reminder to continue "${course.title}" on NonStop Gurukul:\n\n` +
        `${courseLink(course.id)}\n${dueLine(course.dueAt)}\nIf you have already finished, you can ignore this note.\n`,
    };
  }
  const list = courses
    .map(
      (c) =>
        `- ${c.title}: ${courseLink(c.id)}${c.dueAt === null ? '' : ` (finish by ${formatDue(c.dueAt)})`}`,
    )
    .join('\n');
  const subject = `Reminder: ${courses.length} courses are waiting for you`;
  return {
    to,
    subject,
    html: reminderHtml(subject, courses, 'Continue course'),
    text:
      `Hello,\n\nA quick reminder to continue these courses on NonStop Gurukul:\n\n${list}\n\n` +
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
    ? `${late ? 'Overdue' : 'Due soon'}: ${only.title} on NonStop Gurukul`
    : late
      ? `${urgent.length} courses on NonStop Gurukul are overdue or due soon`
      : `${urgent.length} courses on NonStop Gurukul are due soon`;
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
  const group = (
    label: string,
    list: readonly DueCourse[],
    due: (ms: number) => string,
    tone: 'late' | 'soon' | 'plain',
  ): string =>
    list.length === 0
      ? ''
      : sectionLabel(label) +
        list
          .map((c) =>
            courseCard({
              title: c.title,
              href: courseLink(c.id),
              tone,
              ...(c.dueAt === null ? {} : { due: due(c.dueAt) }),
            }),
          )
          .join('');
  const intro = 'A deadline is close or has passed for courses on NonStop Gurukul.';
  const html = emailLayout({
    subject,
    preheader: only ? `${only.title}: ${late ? 'past its due date' : 'due soon'}.` : intro,
    eyebrow: 'Deadline',
    title: !only
      ? 'Courses need your attention'
      : late
        ? 'A course is past its due date'
        : 'A course is due soon',
    intro,
    body:
      group('Past the due date', overdue, (ms) => `Was due ${formatDue(ms)}`, 'late') +
      group('Due soon', dueSoon, finishBy, 'soon') +
      group('Also waiting for you', others, finishBy, 'plain') +
      (cc.length > 0
        ? callout('Your team’s manager is copied on this note, so they know where you are.')
        : '') +
      paragraph('If you have already finished, you can ignore this note.'),
    cta: openCta([...overdue, ...dueSoon, ...others], 'Continue course'),
    reason: 'You are receiving this because a course assigned to you is due soon or overdue.',
  });
  return {
    to,
    ...(cc.length > 0 ? { cc: [...cc] } : {}),
    subject,
    html,
    text:
      `Hello,\n\nA deadline is close or has passed for courses on NonStop Gurukul.\n\n` +
      `${sections.join('\n\n')}\n\n${copied}` +
      `If you have already finished, you can ignore this note.\n`,
  };
}

export { CONTACT };

/** Tells a learner their certificate for a course was revoked, and who to ask about it. */
export function buildRevokedEmail(to: string, courseTitle: string): MailMessage {
  const subject = `Your certificate for ${courseTitle} was revoked`;
  return {
    to,
    subject,
    html: emailLayout({
      subject,
      preheader: `Your certificate for ${courseTitle} no longer counts as valid.`,
      eyebrow: 'Certificate',
      title: 'Your certificate was revoked',
      intro: 'It no longer counts as valid, and its verification page now shows it as revoked.',
      body:
        courseCard({ title: courseTitle, tone: 'late' }) +
        callout(
          `If you think this is a mistake, write to <a href="mailto:${CONTACT}" style="color:#05764c;font-weight:600">${CONTACT}</a> and we will look into it.`,
        ),
      reason: 'You are receiving this because your NonStop Gurukul certificate was revoked.',
    }),
    text:
      `Hello,\n\nYour NonStop Gurukul certificate for "${courseTitle}" has been revoked. ` +
      `It no longer counts as valid, and its verification page now shows it as revoked.\n\n` +
      `If you think this is a mistake, write to ${CONTACT} and we will look into it.\n`,
  };
}
