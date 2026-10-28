import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-28',
  id: 'SKIP-LINK-RETRY',
  title: 'Keyboard and screen-reader users land on each new page, and a failed load can be retried',
  area: 'PLATFORM',
  kind: 'feature',
  why:
    'Moving between pages left focus on the link you pressed, so a keyboard user had to Tab ' +
    'through the whole sidebar again and a screen reader said nothing about the new page. A page ' +
    'that failed to load could only be fixed by reloading the whole app.',
  detail: [
    '"Skip to content" is the first thing Tab reaches and jumps past the sidebar to the page title.',
    'After you open a page, focus moves to its title and screen readers announce it.',
    'When a page does not load, a Retry button tries again without a reload.',
  ],
} satisfies ChangelogEntry;
