import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'AUDIT-LOG-FINISH',
  title: 'The audit log shows names and details, and goes back past the latest 100',
  area: 'KULAPATI',
  kind: 'feature',
  why:
    'Answering "who gave this person the Acharya role?" meant decoding ids, and anything older ' +
    'than the latest 100 actions could not be reached at all.',
  detail: [
    'People appear by name (or email), including the person an action was about.',
    'A new Detail column says what happened: who was assigned which courses, the role someone now holds, the version published.',
    'Load older entries pages back through the whole history, 50 at a time.',
  ],
  notes: ['Assignments made before this change record only how many people, not who.'],
} satisfies ChangelogEntry;
