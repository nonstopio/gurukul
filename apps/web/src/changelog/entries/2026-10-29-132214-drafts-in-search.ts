import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'DRAFTS-IN-SEARCH',
  title: 'Educators can jump to a course they are writing from search',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'Getting back to a course in progress meant opening Studio and finding its card first; ' +
    'now typing its title in search (Ctrl K or ⌘K) opens the course editor from anywhere, even ' +
    'for a draft that has never been published.',
  detail: [
    'Every course you can edit, titled as your draft has it, with its status beside it.',
    'Only Educators and Admins see these; an Admin can edit, and so finds, every course.',
  ],
} satisfies ChangelogEntry;
