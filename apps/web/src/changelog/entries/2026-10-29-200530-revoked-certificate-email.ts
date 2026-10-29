import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'CERT-REVOKED-EMAIL',
  title: 'Learners are emailed when their certificate is revoked',
  area: 'PLATFORM',
  kind: 'feature',
  why:
    'A revoked certificate used to change silently, so a learner found out only when someone ' +
    'checked it. They now hear it straight away, with a contact to ask about it.',
  detail: [
    'The email names the course and gives gurukul@nonstopio.com for questions.',
    'Restoring a certificate, or revoking one that is already revoked, sends nothing.',
  ],
} satisfies ChangelogEntry;
