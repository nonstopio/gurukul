import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-16',
  id: 'GH-125',
  title: 'Assign courses asks before you leave with choices you have not sent',
  area: 'ADMIN',
  kind: 'fix',
  why: 'Someone who had pasted a long list of emails or loaded a CSV, then picked courses and a date, lost all of it to a refresh, the Back button or a click in the sidebar, with no warning. Nothing is sent until the last step, so there was nothing to recover.',
  detail: [
    'If you have chosen courses, people, a team or a due date and have not assigned yet, leaving the page, refreshing or closing the tab asks first. Stay keeps everything as it was.',
    'An empty form, or one you have just assigned, never asks. Nothing you type is stored, so the people you chose are still not kept anywhere.',
  ],
} satisfies ChangelogEntry;
