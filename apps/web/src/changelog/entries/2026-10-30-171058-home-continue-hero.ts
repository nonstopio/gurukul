import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-30',
  id: 'LEARN-HOME-HERO',
  title: 'Home leads with where you left off, and suggests courses when you have nothing started',
  area: 'LEARN',
  kind: 'feature',
  why:
    'Coming back should take one click and say what that click does: the next lesson, how long it ' +
    'is and how much is left. A learner with nothing started used to see an empty page.',
  detail: [
    'A progress ring that grows from where it was, the next lesson with its length, the time left, and one Resume button.',
    'A due date shows in words, and the next course in your queue sits below as "Up next".',
    'With nothing in progress, Home offers up to three courses to start, assigned ones first.',
  ],
} satisfies ChangelogEntry;
