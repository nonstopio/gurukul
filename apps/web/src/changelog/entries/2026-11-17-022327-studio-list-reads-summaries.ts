import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-17',
  id: 'GH-107',
  title: 'Studio opens without downloading every course and every draft',
  area: 'STUDIO',
  kind: 'fix',
  why:
    'The Studio course list, the Media library and the Question bank each downloaded every course ' +
    'and the whole draft of every course you can edit, answer keys included, before showing ' +
    'anything. With hundreds of courses that is tens of megabytes to see a list.',
  detail: [
    'The course list is drawn from a small summary of each published course. A card you can edit shows "Unpublished edits" when its draft was saved after the last publish, without the number of edits or the time of the last one; open the course to see them.',
    'A course never published shows the name it was created with and "Not published yet" in place of its chapter and lesson counts, until its first publish.',
    'Media library and Question bank look inside one course at a time: pick it from the Course dropdown. "Used in" and Import from a Quiz work on that course, and media is counted by the lessons that use it.',
  ],
} satisfies ChangelogEntry;
