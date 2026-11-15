import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-16',
  id: 'GH-113',
  title: 'Assigning or reminding a large group emails everyone',
  area: 'ADMIN',
  kind: 'fix',
  why:
    'Emails went out one at a time and the function stopped after a minute, so a big assignment could ' +
    'save every assignment but email only the first people. Assigning again found them "already ' +
    'assigned" and emailed nobody, and the Admin saw a failure although most of the work was done.',
  detail: [
    'Emails now go out ten at a time, wait and retry when Gmail says to slow down, and a large batch has up to 30 minutes to finish. The page waits for it instead of reporting a failure.',
    'One reminder that fails to send no longer stops the reminders to everyone after it.',
  ],
} satisfies ChangelogEntry;
