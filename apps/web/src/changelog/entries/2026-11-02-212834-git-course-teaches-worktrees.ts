import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-02',
  id: 'GIT-08',
  title: 'The Git course teaches worktrees, and its questions make you think',
  area: 'LEARN',
  kind: 'feature',
  why:
    'People now work on two things at once all the time: a review next to their own work, a fix ' +
    'while tests run, several AI assistants in one project. Stash is the wrong tool for that, and ' +
    'the course never mentioned the right one. Several checks also repeated the Quiz word for ' +
    'word, so passing tested memory, not understanding.',
  detail: [
    'A new lesson in chapter 6: Meera reviews a teammate’s branch in a second folder without touching her own work.',
    'Lesson checks now ask what happens in a situation, not which command has which name.',
    'The Final Quiz asks when to reach for a worktree instead of a second reflog question.',
  ],
} satisfies ChangelogEntry;
