import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'ROLES-POLISH',
  title: 'Roles & access shows the real counts and lets someone be both Acharya and Kulapati',
  area: 'KULAPATI',
  kind: 'feature',
  why:
    'The Learner card said "Everyone" instead of a number, Kulapatis were only a count, picking ' +
    'one role silently removed the other, and a course that was not published yet could not be ' +
    'granted to an Acharya who needed to start building it.',
  detail: [
    'The Learner card counts everyone who has signed in; a Kulapatis list sits under the Acharyas.',
    'Acharya and Kulapati are separate checkboxes, so one person can hold both.',
    'Every course can be granted, drafts and archived ones marked as such.',
  ],
} satisfies ChangelogEntry;
