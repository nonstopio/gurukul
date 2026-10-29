import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'DRAFT-SAVE-AGE',
  title: 'Studio shows the draft number and when it was last saved',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'A bare "Saved" did not say whether it meant a moment ago or last week, so an Acharya coming ' +
    'back to a course could not tell how fresh the draft was, or whether a colleague had saved since.',
  detail: [
    'The editor bar now reads "Draft v7 · saved just now", and the age keeps counting up while the page stays open.',
    'Saving and unsaved changes read the same way, led by the draft number.',
  ],
} satisfies ChangelogEntry;
