import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-27',
  id: 'COURSE-READ-TOLERANT',
  title: 'One course the app cannot read no longer empties the course list',
  area: 'LEARN',
  kind: 'fix',
  why:
    'The app read every course strictly, so a single course with a block type it did not know, ' +
    'or one field out of shape, failed the whole list: learners saw no courses at all, and a lesson ' +
    'with a newer block would not open, although the player already had a notice for that case.',
  detail: [
    'A lesson with a block this version of the app does not understand opens as usual and shows "This content needs a newer version of the app." where that block would be.',
    'A course that cannot be read at all is left out of the course lists for learners and in Studio; every other course still loads.',
    'Publishing or rolling back a course brings a draft or snapshot saved in an older format up to date first.',
  ],
} satisfies ChangelogEntry;
