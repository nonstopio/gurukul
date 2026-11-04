import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-05',
  id: 'SIGNIN-CLASSROOM',
  title: 'The sign-in page shows a small class in progress',
  area: 'LEARN',
  kind: 'feature',
  why:
    'Someone signing in for the first time saw a mock course card and could not tell what ' +
    'Gurukul is like: teammates teaching teammates, in short lessons with Quizzes and a ' +
    'certificate at the end.',
  detail: [
    'Beside the sign-in button, a teammate teaches at an outdoor chalkboard that writes out how ' +
      'Gurukul works, then turns to two teammates who nod along.',
    'With reduced motion turned on, the board is shown finished and nothing moves.',
  ],
} satisfies ChangelogEntry;
