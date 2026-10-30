import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-30',
  id: 'COURSE-TILES-SEARCH',
  title: 'Courses are tiles with a picture, and the catalogue has a proper search card',
  area: 'PLATFORM',
  kind: 'feature',
  why:
    'A course shown as a text row was hard to scan, only its title could be clicked, and the catalogue ' +
    'filters were loose boxes in a row that clipped on narrower screens.',
  detail: [
    'Every course shows as a tile with its picture, or the first image in the course, or its name on its own colour.',
    'The whole tile opens the course, not just the title.',
    'The catalogue search is one card: a large search field, views, dropdowns, the filters that are on as removable chips, and the result count.',
  ],
} satisfies ChangelogEntry;
