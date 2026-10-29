import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'LEARNERS-SELECT-ALL',
  title: 'Select everyone on the Learners list, not just one page',
  area: 'KULAPATI',
  kind: 'feature',
  why:
    'Ticking the page only reached 25 people, so sending a reminder or changing a role for a whole ' +
    'team meant repeating the same steps page after page.',
  detail: [
    'Tick every row on a page and a "Select all N" button appears in the bulk bar; it selects everyone the current filters and tab match.',
    'Assign course, Send reminder and Change role then act on all of them. Unticking a row, changing a filter or turning the page goes back to a normal selection.',
  ],
} satisfies ChangelogEntry;
