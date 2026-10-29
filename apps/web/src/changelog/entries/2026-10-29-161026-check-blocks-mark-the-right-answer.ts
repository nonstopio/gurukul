import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'CHECK-RIGHT-ANSWER',
  title: 'Check questions show which answer is right',
  area: 'LEARN',
  kind: 'feature',
  why:
    'Revealing a check question used to show only the explanation, so you had to work out from ' +
    'the text whether your pick was the right one.',
  detail: [
    'After you reveal a check, the right answer is marked, and your pick is marked if it was wrong.',
    'Acharyas choose the right answer for each check in Vyasa Studio, and publishing needs one.',
  ],
} satisfies ChangelogEntry;
