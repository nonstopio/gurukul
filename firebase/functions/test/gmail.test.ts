import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SENDER,
  buildRawMessage,
  clientFromCredentials,
  createMailer,
  gmailMailer,
  htmlFromText,
  serviceAccountPort,
  unconfiguredMailer,
} from '../src/gmail.js';
import { courseLink } from '../src/mail.js';
import * as logger from 'firebase-functions/logger';

const message = {
  to: 'a@example.com',
  subject: 'Hi\r\nBcc: x@y.z',
  text: 'Hello <b>\n\nhttps://x.test/a',
};
const decode = (raw: string): string => Buffer.from(raw, 'base64url').toString('utf8');
const part = (mime: string, type: string): string => {
  const body = mime.split(`Content-Type: ${type}; charset=UTF-8`)[1] ?? '';
  const chunk = body.split('\r\n\r\n')[1]?.split('\r\n--')[0] ?? '';
  return Buffer.from(chunk.replace(/\r\n/g, ''), 'base64').toString('utf8');
};

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env['SITE_URL'];
});

describe('htmlFromText', () => {
  it('escapes markup, links urls and keeps paragraphs', () => {
    const html = htmlFromText(message.text);
    expect(html).toContain('Hello &lt;b&gt;');
    expect(html).toContain('<a href="https://x.test/a">https://x.test/a</a>');
    expect(html.match(/<p /g)?.length).toBe(3);
  });
});

describe('buildRawMessage', () => {
  const mime = decode(buildRawMessage(message, SENDER, 'help@nonstopio.com', 'B'));

  it('sets from, reply-to and to, and cannot be given a header by a subject', () => {
    expect(mime).toContain(`From: NonStop Academy <${SENDER}>`);
    expect(mime).toContain('Reply-To: help@nonstopio.com');
    expect(mime).toContain('To: a@example.com');
    expect(mime).not.toMatch(/^Bcc:/m);
  });

  it('carries the text and an html alternative', () => {
    expect(part(mime, 'text/plain')).toBe(message.text);
    expect(part(mime, 'text/html')).toContain('<a href="https://x.test/a">');
  });

  it('works with the default boundary', () => {
    expect(decode(buildRawMessage(message, SENDER, SENDER))).toContain('boundary="gurukul-');
  });
});

describe('gmailMailer', () => {
  it('sends through the port, from the sender by default', async () => {
    const sendRaw = vi.fn().mockResolvedValue(undefined);
    await gmailMailer({ sendRaw }).send(message);
    const mime = decode(sendRaw.mock.calls[0]?.[0] as string);
    expect(mime).toContain(`From: NonStop Academy <${SENDER}>`);
    expect(mime).toContain(`Reply-To: ${SENDER}`);
  });

  it('lets a send failure reach the caller', async () => {
    const sendRaw = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(gmailMailer({ sendRaw }).send(message)).rejects.toThrow('boom');
  });
});

describe('serviceAccountPort', () => {
  it('posts the raw message to the Gmail send endpoint', async () => {
    const request = vi.fn().mockResolvedValue({});
    await serviceAccountPort({ request }).sendRaw('RAW');
    expect(request).toHaveBeenCalledWith({
      url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      method: 'POST',
      data: { raw: 'RAW' },
    });
  });
});

describe('clientFromCredentials', () => {
  it('builds a client from a key, and refuses anything else', () => {
    const ok = JSON.stringify({ client_email: 'sa@p.iam.gserviceaccount.com', private_key: 'k' });
    expect(clientFromCredentials(ok)).not.toBeNull();
    expect(clientFromCredentials('{"client_email":"a"}')).toBeNull();
    expect(clientFromCredentials('not json')).toBeNull();
  });
});

describe('createMailer', () => {
  it('warns instead of sending when no credentials are configured', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    expect(createMailer({})).toBe(unconfiguredMailer);
    await createMailer({}).send(message);
    expect(warn).toHaveBeenCalledWith(
      'Email skipped',
      expect.objectContaining({ reason: expect.any(String) }),
    );
  });

  it('degrades the same way when the credentials are unusable', () => {
    expect(createMailer({ GMAIL_CREDENTIALS: 'x' })).toBe(unconfiguredMailer);
  });

  it('sends through the client with the configured sender and reply-to', async () => {
    const request = vi.fn().mockResolvedValue({});
    const makeClient = vi.fn().mockReturnValue({ request });
    await createMailer(
      { GMAIL_CREDENTIALS: '{}', MAIL_FROM: 'f@nonstopio.com', MAIL_REPLY_TO: 'r@nonstopio.com' },
      makeClient,
    ).send(message);
    expect(makeClient).toHaveBeenCalledWith('{}', 'f@nonstopio.com');
    const mime = decode(request.mock.calls[0]?.[0].data.raw as string);
    expect(mime).toContain('From: NonStop Academy <f@nonstopio.com>');
    expect(mime).toContain('Reply-To: r@nonstopio.com');
  });

  it('defaults to the sender', async () => {
    const request = vi.fn().mockResolvedValue({});
    await createMailer({ GMAIL_CREDENTIALS: '{}' }, () => ({ request })).send(message);
    expect(decode(request.mock.calls[0]?.[0].data.raw as string)).toContain(SENDER);
  });
});

describe('site url', () => {
  it('uses SITE_URL for links when set', () => {
    process.env['SITE_URL'] = 'https://staging.test/';
    expect(courseLink('git')).toBe('https://staging.test/courses/git');
  });
});
