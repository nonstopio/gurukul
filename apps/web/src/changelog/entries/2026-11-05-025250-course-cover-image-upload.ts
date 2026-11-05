import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-05',
  id: 'COVER-IMAGE',
  title: 'Upload a cover image for a course',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'A course could only show the first picture in its lessons, or its name on a colour, so ' +
    'Educators had no say in how their course looks in the catalogue.',
  detail: [
    'Studio → course → Details now takes a cover image, with the same checks and Shrink it for ' +
      'me as lesson images, and a preview of the course tile.',
    'The cover shows on every course tile once you publish; Remove goes back to the first ' +
      'lesson image or the theme colour.',
    'The Publish dialog now says what to fix in plain words, such as "The title of lesson 2 in ' +
      'chapter 1 is empty", and a draft saved before this change publishes as before.',
  ],
} satisfies ChangelogEntry;
