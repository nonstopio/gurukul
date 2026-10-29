import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-27',
  id: 'ADMIN-AUDIT-EXPORT',
  title: 'Admins can read the audit log and export assignments to a spreadsheet',
  area: 'ADMIN',
  kind: 'feature',
  why:
    'Every Admin action was already recorded, but nobody could read the record, so it could not ' +
    'answer "who gave this person the Educator role?". And reporting on assignments meant copying ' +
    'rows by hand; a file a spreadsheet opens removes that.',
  detail: [
    'Audit log (a button on the overview) lists the latest 100 actions, newest first: assigning, reminders, role changes, certificate revokes, Quiz retakes and course publishing, with who did it.',
    'Export CSV on the overview saves every assignment with its course, status, due date and whether the person has signed in yet.',
  ],
  notes: [
    'The export is built in the browser from the assignments already loaded (the newest 500), so it adds no database reads. Cells that start with = + - or @ are prefixed so a spreadsheet never runs them as formulas.',
  ],
} satisfies ChangelogEntry;
