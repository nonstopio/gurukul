import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-16',
  id: 'GH-118',
  title: 'Studio warns as a course nears its size limit',
  area: 'STUDIO',
  kind: 'fix',
  why: 'One course is stored as one document with a hard size limit. A very large course stopped saving or publishing with an error that did not say why, and nothing warned that it was close.',
  detail: [
    'From about 700 KB the editor says the course is nearly full, with its size, so there is time to move chapters into a second course.',
    'Over 900 KB autosave stops and says why. Your edits stay on the page and on this device; remove content and it saves again.',
    'Publishing a course over the limit is refused with the same explanation instead of a raw error.',
  ],
} satisfies ChangelogEntry;
