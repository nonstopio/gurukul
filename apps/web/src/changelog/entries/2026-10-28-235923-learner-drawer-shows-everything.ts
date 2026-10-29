import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-28',
  id: 'LEARNER-DRAWER-COMPLETE',
  title: 'The learner drawer shows every assigned course and each Quiz attempt',
  area: 'ADMIN',
  kind: 'feature',
  why:
    'Opening a learner is how an Admin answers "is this person on track?". The drawer only ' +
    'listed courses they had already opened, so the ones they were behind on (assigned, never ' +
    'started, maybe overdue) were exactly the ones it hid, and a pending invite showed nothing.',
  detail: [
    'Every course assigned to the person appears, started or not, with its due date, whether it is mandatory, and a status: not started, in progress, overdue or completed.',
    'Each Quiz they attempted is named by its title, with their best score and their recent attempts with dates and scores. Resetting a cooldown names the Quiz too.',
    'A pending invite opens to the courses waiting for them.',
    'Revoking a certificate now asks first; restoring one does not.',
  ],
} satisfies ChangelogEntry;
