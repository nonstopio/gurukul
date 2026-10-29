import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'COURSE-OVERVIEW-DETAIL',
  title: 'The course overview tells you more before you start',
  area: 'LEARN',
  kind: 'feature',
  why:
    'The overview showed only a one-line summary, so you could not tell who teaches a course or ' +
    'why a row was locked, and it forgot which parvas you had opened every time you came back.',
  detail: [
    'The full course description, with formatting, and the Acharyas who teach it.',
    'A locked row says what unlocks it, such as passing the Pariksha before it.',
    'Parvas you open stay open next time, and a finished course links to your certificate.',
  ],
} satisfies ChangelogEntry;
