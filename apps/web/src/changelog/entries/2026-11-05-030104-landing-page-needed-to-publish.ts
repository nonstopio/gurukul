import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-05',
  id: 'LANDING-PAGE-TO-PUBLISH',
  title: 'Publishing needs a landing page description and two outcomes',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'A course could go live with an empty landing page, so learners opened it without knowing ' +
    'who it is for or what they would be able to do afterwards.',
  detail: [
    'The publish checklist asks for a description and at least 2 outcomes, and links to the Landing page tab.',
    'The Landing page tab marks both as required and says what is missing.',
    'A blank outcome blocks publishing too, so the landing page never shows an empty bullet.',
    'Courses already published stay published; only their next publish asks for it.',
  ],
} satisfies ChangelogEntry;
