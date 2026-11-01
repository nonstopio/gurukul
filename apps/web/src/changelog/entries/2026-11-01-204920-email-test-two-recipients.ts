import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-01',
  id: 'EMAIL-TEST-RECIPIENTS',
  title: 'Admins can send a test email to two addresses and choose who gets it',
  area: 'ADMIN',
  kind: 'feature',
  why: 'A test that could only reach your own inbox did not show how an email looks to someone else, or whether it lands for a colleague. Naming up to two people settles both.',
  detail: [
    'Email templates now has a First and an optional Second email address; the first is filled with yours.',
    'Both must be @nonstopio.com addresses, and the same address twice is sent once.',
    'The page also fits the form on screen better: the fields stack with even spacing.',
  ],
} satisfies ChangelogEntry;
