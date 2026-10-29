import { JWT } from 'google-auth-library';
import { log } from './logging/log.js';
import type { MailMessage, Mailer } from './mail.js';

/** The address every email comes from (`.plan/13-open-questions.md`, question 4). */
export const SENDER = 'gurukul@nonstopio.com';

const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const SCOPE = 'https://www.googleapis.com/auth/gmail.send';

/** The one thing the mailer needs from Gmail: send one RFC 2822 message, base64url encoded. */
export interface GmailPort {
  sendRaw(raw: string): Promise<void>;
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The plain-text body as a small HTML page: paragraphs, bullet lines and links made clickable. */
export function htmlFromText(text: string): string {
  const linked = (line: string): string =>
    escapeHtml(line).replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}">${url}</a>`);
  const body = text
    .trim()
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 16px">${block.split('\n').map(linked).join('<br>')}</p>`)
    .join('');
  return (
    '<!doctype html><html><body style="margin:0;background:#f6f5f2;padding:24px">' +
    '<div style="max-width:560px;margin:0 auto;background:#fff;padding:24px;border-radius:8px;' +
    'font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1c1b1a">' +
    `${body}<p style="margin:24px 0 0;color:#6b6862;font-size:13px">NonStop Academy</p>` +
    '</div></body></html>'
  );
}

const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64');
const wrap = (s: string): string => s.replace(/(.{76})/g, '$1\r\n');

/** A header value with no line breaks, so a subject can never add a header. */
const oneLine = (s: string): string => s.replace(/[\r\n]+/g, ' ').trim();

/** The message as `multipart/alternative` (text and HTML), base64url encoded for the Gmail API. */
export function buildRawMessage(
  message: MailMessage,
  from: string,
  replyTo: string,
  boundary = `gurukul-${Math.random().toString(36).slice(2)}`,
): string {
  const lines = [
    `From: NonStop Academy <${oneLine(from)}>`,
    `Reply-To: ${oneLine(replyTo)}`,
    `To: ${oneLine(message.to)}`,
    `Subject: =?UTF-8?B?${b64(oneLine(message.subject))}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap(b64(message.text)),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap(b64(htmlFromText(message.text))),
    `--${boundary}--`,
    '',
  ];
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url');
}

/** A `Mailer` that sends through Gmail as `from`, with replies going to `replyTo`. */
export function gmailMailer(port: GmailPort, from = SENDER, replyTo = from): Mailer {
  return {
    async send(message) {
      await port.sendRaw(buildRawMessage(message, from, replyTo));
      log.info('Email sent', { kind: 'gmail' });
    },
  };
}

/** What the Gmail client does for us: a signed request. `JWT` satisfies it. */
export interface GmailClient {
  request(options: { url: string; method: 'POST'; data: { raw: string } }): Promise<unknown>;
}

/** Gmail through a service account with domain-wide delegation, impersonating the sender. */
export function serviceAccountPort(client: GmailClient): GmailPort {
  return {
    async sendRaw(raw) {
      await client.request({ url: SEND_URL, method: 'POST', data: { raw } });
    },
  };
}

/** The credentials JSON (`client_email`, `private_key`) as a Gmail client, or null if unusable. */
export function clientFromCredentials(json: string, subject = SENDER): GmailClient | null {
  try {
    const parsed = JSON.parse(json) as { client_email?: unknown; private_key?: unknown };
    if (typeof parsed.client_email !== 'string' || typeof parsed.private_key !== 'string') {
      return null;
    }
    return new JWT({
      email: parsed.client_email,
      key: parsed.private_key,
      scopes: [SCOPE],
      subject,
    });
  } catch {
    return null;
  }
}

/** Used until the mailbox and its grant exist (maintainer row OPS-25): warns, sends nothing. */
export const unconfiguredMailer: Mailer = {
  async send() {
    log.warn('Email skipped', { reason: 'no gmail credentials configured' });
  },
};

/**
 * The mailer for this deployment. `GMAIL_CREDENTIALS` holds the service-account key JSON (a
 * secret, never committed); without a usable one nothing is sent and each attempt logs a warning.
 * `makeClient` is a seam for tests.
 */
export function createMailer(
  env: Record<string, string | undefined>,
  makeClient: (json: string, subject: string) => GmailClient | null = clientFromCredentials,
): Mailer {
  const json = env['GMAIL_CREDENTIALS'];
  if (!json) return unconfiguredMailer;
  const from = env['MAIL_FROM'] || SENDER;
  const client = makeClient(json, from);
  if (!client) return unconfiguredMailer;
  return gmailMailer(serviceAccountPort(client), from, env['MAIL_REPLY_TO'] || from);
}
