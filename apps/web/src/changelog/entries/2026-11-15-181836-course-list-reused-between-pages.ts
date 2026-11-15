import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-15',
  id: 'GH-107',
  title: 'Home and the catalogue open faster the second time',
  area: 'PLATFORM',
  kind: 'fix',
  why: 'Every visit to Home, the catalogue, Certificates, the Admin pages and search downloaded every course in full, lessons and Quiz questions included, only to draw a title and a picture. With twenty courses that is about a megabyte per page, and it grew with every lesson added.',
  detail: [
    'The list of courses is now read once and reused for five minutes as you move between pages, so going from Home to the catalogue and back does not download it again.',
    'A newly published course can take up to five minutes to appear for someone who already has Gurukul open. In the tab that published it, it appears at once.',
  ],
  notes: [
    'The first visit still downloads whole courses. A small summary per course, written at publish, is the proper fix and needs a data model change first.',
  ],
} satisfies ChangelogEntry;
