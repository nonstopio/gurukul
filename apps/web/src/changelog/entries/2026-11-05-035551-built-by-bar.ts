import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-05',
  id: 'BUILT-BY-BAR',
  title: 'Every page in the sidebar layout ends with a bar naming who built Gurukul',
  area: 'PLATFORM',
  kind: 'feature',
  why:
    'Gurukul is built in the open by people at NonStop, but nothing in the app said so: ' +
    'someone with a bug or an idea had no way to find the repository, and the people who ' +
    'built it went unnamed.',
  detail: [
    "At the foot of each page: What's new, a link to the repository on GitHub, a short line " +
      'inviting issues and pull requests, and the photos of the people who contributed.',
    'The line changes every few seconds, holds still while you point at it, and stays put ' +
      'with reduced motion turned on. Lessons, Quizzes and the Studio editors leave the bar out.',
  ],
} satisfies ChangelogEntry;
