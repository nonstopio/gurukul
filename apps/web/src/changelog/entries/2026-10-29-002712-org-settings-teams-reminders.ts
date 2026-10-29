import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'ORG-SETTINGS',
  title: 'Admins set the teams list and switch daily reminders on in Org settings',
  area: 'ADMIN',
  kind: 'feature',
  why:
    'Nothing could fill in the teams list, so the team filter in Learners and "whole team" in ' +
    'Assign courses had nothing to offer, and the daily reminders could only be switched on by ' +
    'editing the database by hand. Both are now a setting an Admin controls.',
  detail: [
    'Org settings in the console adds and removes teams; a removed team stays on the profiles that already have it.',
    'One switch turns the daily reminder emails on or off. They start off.',
    'Only an Admin can change these settings, and only in this shape: teams and the reminders switch.',
  ],
} satisfies ChangelogEntry;
