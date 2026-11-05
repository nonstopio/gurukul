import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-05',
  id: 'DRAFT-REAL-CHANGES',
  title: 'The draft number is the version it will publish as, and only real changes are saved',
  area: 'STUDIO',
  kind: 'fix',
  why:
    'Typing a space and deleting it again saved the draft each time and pushed its number up, so a ' +
    'course looked as if it had unpublished changes when nothing had changed.',
  detail: [
    'The course editor bar reads "Draft v4" while v3 is live, however many times the draft is saved.',
    'An edit that is undone before the autosave writes nothing.',
    'When the draft matches the live course, the bar says "No changes since v3" and Publish is disabled.',
  ],
} satisfies ChangelogEntry;
