import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-27',
  id: 'CHAPTER-UNLOCKS-ON-PASS',
  title: 'Passing a chapter’s Quiz opens the next chapter',
  area: 'QUIZ',
  kind: 'fix',
  why:
    'The Quiz is the proof you understood the chapter, so passing it should be what moves you ' +
    'on. Before, a sequential course also waited for every lesson to be ticked, and a locked ' +
    'Quiz could still be graded by calling the server directly.',
  detail: [
    'In a sequential course the next chapter opens as soon as every Quiz in the one before is passed; a chapter with no Quiz still opens it once all its lessons are done.',
    'The server now refuses to check answers or grade a Quiz that is still locked for you, so the lock holds outside the app too.',
  ],
} satisfies ChangelogEntry;
