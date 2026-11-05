import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-05',
  id: 'PUBLISH-ONLY-WITH-CHANGES',
  title: 'Publish only when something changed; who can open a course changes without a new version',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'Publish looked available with nothing to publish, and changing who can open a course ' +
    'forced a whole new version on learners.',
  detail: [
    'With no changes since the live version, Publish is disabled and says so.',
    'Editing a Quiz answer key counts as a change, even though the old keys cannot be compared.',
    'Who can open this course has its own card on the Structure tab; saving it applies at once.',
    'The publish dialog shows who can open the course and links to that card.',
  ],
} satisfies ChangelogEntry;
