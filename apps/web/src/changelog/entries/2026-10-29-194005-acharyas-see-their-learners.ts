import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'EDUCATOR-LEARNERS',
  title: 'Educators see who is learning their courses',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'An Educator could see how many people started a course but not who, so they could not follow ' +
    'up with the people stuck halfway. Names are shown for their own courses only, and nothing else ' +
    'about a person.',
  detail: [
    'The Analytics tab of a course in Studio lists each learner who started it, with their progress and when they were last active.',
    'Learners who started before this shipped show as "Name not recorded".',
  ],
} satisfies ChangelogEntry;
