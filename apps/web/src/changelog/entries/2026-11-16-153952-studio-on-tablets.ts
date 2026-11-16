import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-16',
  id: 'GH-126',
  title: 'Studio works on a tablet and in a half-screen window',
  area: 'STUDIO',
  kind: 'fix',
  why: 'Below 1024px wide, every Studio page was replaced by "needs a bigger canvas", so an Educator on a tablet or with a split-screen laptop window could not even fix a typo or read their own course, although every page already worked at that width.',
  detail: [
    'Studio now opens from 640px wide: a tablet held upright, or a laptop window beside another one. The columns stack, and the lesson list scrolls in its card with the current lesson in view.',
    'Narrower than that, a phone for instance, Studio still asks for a wider window, with a link back to Home.',
  ],
} satisfies ChangelogEntry;
