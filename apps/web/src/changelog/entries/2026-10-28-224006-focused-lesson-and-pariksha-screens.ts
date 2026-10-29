import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-28',
  id: 'FOCUSED-SHELL',
  title: 'Lessons, Parikshas and results get the whole screen',
  area: 'LEARN',
  kind: 'feature',
  why:
    'While you study or sit a Pariksha the menu down the side only pulls the eye away and takes ' +
    'width from the lesson. Now those screens keep just a dark bar on top: the way back, the course ' +
    'and how far through it you are.',
  detail: [
    'Course progress reads as a percentage and a count, for example "60% · 3 / 5".',
    'Each screen has a single main heading, the lesson or Pariksha title, which is where focus lands and what a screen reader announces.',
    'Search still opens with Ctrl K or ⌘K.',
  ],
} satisfies ChangelogEntry;
