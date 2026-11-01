import { describe, expect, it, vi } from 'vitest';
import { EMAIL_TEMPLATES, listEmailTemplates, sendTestEmail } from '../src/email-templates.js';
import * as mail from '../src/mail.js';
import { unconfiguredMailer } from '../src/gmail.js';

const admin = { uid: 'k', email: 'k@nonstopio.com', claims: { admin: true } };
const learner = { uid: 'u', email: 'u@nonstopio.com', claims: {} };

describe('EMAIL_TEMPLATES', () => {
  it('has one template for every build*Email in mail.ts, so a new email cannot go unlisted', () => {
    const builders = Object.keys(mail).filter((k) => /^build.+Email$/.test(k));
    expect(EMAIL_TEMPLATES).toHaveLength(builders.length);
  });
});

describe('listEmailTemplates', () => {
  it('shows every template, filled with sample data, to an Admin', () => {
    const views = listEmailTemplates(admin);
    expect(views.map((v) => v.id)).toEqual(EMAIL_TEMPLATES.map((t) => t.id));
    for (const v of views) {
      expect(v.name && v.when && v.subject && v.body).toBeTruthy();
    }
    expect(views.find((v) => v.id === 'assigned')?.body).toContain('31 Dec 2026');
  });

  it('refuses anyone who is not an Admin', () => {
    expect(() => listEmailTemplates(learner)).toThrow(
      expect.objectContaining({ code: 'AUTH_2001' }),
    );
  });
});

describe('sendTestEmail', () => {
  it('sends the chosen template to the caller only, marked as a test', async () => {
    const mailer = { send: vi.fn().mockResolvedValue(undefined) };
    expect(await sendTestEmail({ mailer }, admin, { templateId: 'reminder' })).toEqual({
      to: 'k@nonstopio.com',
    });
    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'k@nonstopio.com',
        subject: '[Test] Reminder: Sample course is waiting for you',
      }),
    );
  });

  it('refuses a non-Admin, an unknown template and a missing id', async () => {
    const mailer = { send: vi.fn() };
    await expect(
      sendTestEmail({ mailer }, learner, { templateId: 'assigned' }),
    ).rejects.toMatchObject({
      code: 'AUTH_2001',
    });
    await expect(sendTestEmail({ mailer }, admin, { templateId: 'nope' })).rejects.toMatchObject({
      code: 'VAL_1002',
    });
    await expect(sendTestEmail({ mailer }, admin, {})).rejects.toMatchObject({ code: 'VAL_1001' });
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('fails instead of pretending when no Gmail credentials are set', async () => {
    await expect(
      sendTestEmail({ mailer: unconfiguredMailer }, admin, { templateId: 'assigned' }),
    ).rejects.toMatchObject({ code: 'GEN_5004' });
  });
});
