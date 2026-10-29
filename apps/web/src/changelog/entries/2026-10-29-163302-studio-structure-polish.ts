import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'STUDIO-STRUCTURE-POLISH',
  title: 'Studio lets you rename lessons in the outline and jump to any Quiz',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'Fixing a lesson title meant opening the lesson, and the lesson editor could not reach a ' +
    'Quiz, so Educators kept going back to the outline just to move around.',
  detail: [
    'Rename a lesson or Quiz in place from the Structure tab.',
    'The lesson rail lists Quizzes beside lessons.',
    'An empty lesson says "This lesson is empty" instead of showing a blank canvas.',
  ],
} satisfies ChangelogEntry;
