import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'STUDIO-PUBLISH-ARCHIVED',
  title: 'Studio warns that publishing an archived course brings it back',
  area: 'STUDIO',
  kind: 'fix',
  why:
    'Publishing quietly un-archived a retired course, so an Acharya could reopen it to learners ' +
    'without meaning to.',
  detail: ['The publish dialog says the course is archived and what publishing will do.'],
} satisfies ChangelogEntry;
