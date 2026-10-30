import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-30',
  id: 'ADMIN-PEOPLE-TYPEAHEAD',
  title: 'Picking people is one search field with photos, everywhere in the console',
  area: 'ADMIN',
  kind: 'feature',
  why:
    'Adding people meant pasting bare email addresses, so you could not see who someone was, and ' +
    'a team could be made with nobody in it.',
  detail: [
    'Click the field to see the first people, or type a name or email: each match shows a photo, name and email.',
    'Pick as many as you want. An email for someone who has not signed in yet can still be typed or pasted.',
    'This is the same field when assigning courses and when making or editing a team. A team now needs at least one member.',
  ],
} satisfies ChangelogEntry;
