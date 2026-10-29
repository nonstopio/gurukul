import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'EMAIL-GMAIL',
  title: 'Assignment and reminder emails are sent from gurukul@nonstopio.com',
  area: 'PLATFORM',
  kind: 'feature',
  why:
    'Assignments and reminders were only queued and never delivered, so people found out about a ' +
    'course by chance. They now arrive from one recognisable NonStop address that accepts replies.',
  detail: [
    'Each email has a plain-text and a formatted version, with a link straight to the course.',
    'Until the mailbox is connected, nothing is sent and the console works as before.',
  ],
} satisfies ChangelogEntry;
