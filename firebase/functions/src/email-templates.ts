import { ApiException } from '@gurukul/schema';
import { requireAdmin } from './errors.js';
import type { Caller } from './errors.js';
import { unconfiguredMailer } from './gmail.js';
import {
  buildAssignedEmail,
  buildDeadlineEmail,
  buildReminderEmail,
  buildRevokedEmail,
} from './mail.js';
import type { MailMessage, Mailer } from './mail.js';
import { isAllowedEmail } from './roles.js';
import { badCount, badField, invalid } from './validation.js';

export interface EmailTemplate {
  id: string;
  name: string;
  /** Plain English: what makes Gurukul send it. */
  when: string;
  /** The email to `to`, filled with sample data. */
  build(to: string): MailMessage;
}

const SAMPLE_DUE = Date.UTC(2026, 11, 31);
const SAMPLE_PAST = Date.UTC(2026, 11, 20);
const SAMPLE_COURSE = { id: 'sample-course', title: 'Sample course' };

/** Every email Gurukul sends. A new `build*Email` in `mail.ts` is listed here too. */
export const EMAIL_TEMPLATES: readonly EmailTemplate[] = [
  {
    id: 'assigned',
    name: 'Course assigned',
    when: 'An Admin assigns a course and chooses to notify the person.',
    build: (to) => buildAssignedEmail(to, [SAMPLE_COURSE], SAMPLE_DUE),
  },
  {
    id: 'reminder',
    name: 'Course reminder',
    when: 'A reminder, daily or sent by an Admin, for a course someone has not finished.',
    build: (to) => buildReminderEmail(to, [{ ...SAMPLE_COURSE, dueAt: SAMPLE_DUE }]),
  },
  {
    id: 'deadline',
    name: 'Deadline notice',
    when:
      'The daily run, once when a course is due in 5 days or less and once when it is overdue; ' +
      'the managers of the team it was assigned through are copied.',
    // The sample copies nobody: a test send goes only to the addresses the Admin names.
    build: (to) =>
      buildDeadlineEmail(to, {
        overdue: [{ ...SAMPLE_COURSE, dueAt: SAMPLE_PAST }],
        dueSoon: [{ id: 'sample-soon', title: 'Another sample course', dueAt: SAMPLE_DUE }],
        others: [],
      }),
  },
  {
    id: 'revoked',
    name: 'Certificate revoked',
    when: 'An Admin revokes a learner’s certificate.',
    build: (to) => buildRevokedEmail(to, SAMPLE_COURSE.title),
  },
];

export interface TemplateView {
  id: string;
  name: string;
  when: string;
  subject: string;
  /** The plain-text alternative. */
  body: string;
  /** The designed email. */
  html: string;
}

/** `listEmailTemplates`: each template as the Admin would receive it, with sample data. */
export function listEmailTemplates(caller: Caller): TemplateView[] {
  requireAdmin(caller, 'listEmailTemplates');
  return EMAIL_TEMPLATES.map(({ id, name, when, build }) => {
    const { subject, text, html } = build(caller.email as string);
    return { id, name, when, subject, body: text, html };
  });
}

/** The most addresses one test send may go to. */
export const MAX_TEST_RECIPIENTS = 2;

/** The recipients of a test send: one or two distinct NonStop io addresses, lower-cased. */
function testRecipients(value: unknown): string[] {
  if (!Array.isArray(value)) throw badField('recipients', value, 'must be a list of addresses');
  if (value.length < 1 || value.length > MAX_TEST_RECIPIENTS) {
    throw badCount('recipients', `1-${MAX_TEST_RECIPIENTS}`);
  }
  const emails = value.map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : ''));
  if (!emails.every((e) => isAllowedEmail(e))) {
    throw invalid('recipients', 'must be @nonstopio.com addresses');
  }
  return [...new Set(emails)];
}

/**
 * `sendTestEmail`: sends one template, with sample data, to one or two NonStop io addresses the
 * Admin names. Refuses when no Gmail credentials are set, since a send that goes nowhere would
 * look like success.
 */
export async function sendTestEmail(
  deps: { mailer: Mailer },
  caller: Caller,
  data: { templateId?: unknown; recipients?: unknown },
): Promise<{ to: string[] }> {
  requireAdmin(caller, 'sendTestEmail');
  const template = EMAIL_TEMPLATES.find((t) => t.id === data.templateId);
  if (!template) throw badField('templateId', data.templateId, 'must be a template id');
  const to = testRecipients(data.recipients);
  if (deps.mailer === unconfiguredMailer) throw new ApiException('GEN_5004', ['sendTestEmail']);
  for (const address of to) {
    const message = template.build(address);
    await deps.mailer.send({ ...message, subject: `[Test] ${message.subject}` });
  }
  return { to };
}
