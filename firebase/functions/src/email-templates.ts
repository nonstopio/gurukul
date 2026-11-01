import { ApiException } from '@gurukul/schema';
import { requireAdmin } from './errors.js';
import type { Caller } from './errors.js';
import { unconfiguredMailer } from './gmail.js';
import { buildAssignedEmail, buildReminderEmail, buildRevokedEmail } from './mail.js';
import type { MailMessage, Mailer } from './mail.js';
import { badField } from './validation.js';

export interface EmailTemplate {
  id: string;
  name: string;
  /** Plain English: what makes Gurukul send it. */
  when: string;
  /** The email to `to`, filled with sample data. */
  build(to: string): MailMessage;
}

const SAMPLE_DUE = Date.UTC(2026, 11, 31);
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
  body: string;
}

/** `listEmailTemplates`: each template as the Admin would receive it, with sample data. */
export function listEmailTemplates(caller: Caller): TemplateView[] {
  requireAdmin(caller, 'listEmailTemplates');
  return EMAIL_TEMPLATES.map(({ id, name, when, build }) => {
    const { subject, text } = build(caller.email as string);
    return { id, name, when, subject, body: text };
  });
}

/**
 * `sendTestEmail`: sends one template, with sample data, to the Admin who asked and nobody else.
 * Refuses when no Gmail credentials are set, since a send that goes nowhere would look like success.
 */
export async function sendTestEmail(
  deps: { mailer: Mailer },
  caller: Caller,
  data: { templateId?: unknown },
): Promise<{ to: string }> {
  requireAdmin(caller, 'sendTestEmail');
  const template = EMAIL_TEMPLATES.find((t) => t.id === data.templateId);
  if (!template) throw badField('templateId', data.templateId, 'must be a template id');
  if (deps.mailer === unconfiguredMailer) throw new ApiException('GEN_5004', ['sendTestEmail']);
  const to = caller.email as string;
  const message = template.build(to);
  await deps.mailer.send({ ...message, subject: `[Test] ${message.subject}` });
  return { to };
}
