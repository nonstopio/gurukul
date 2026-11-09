import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-09',
  id: 'SAVE-WHILE-SAVING',
  title: 'Studio saves no longer drop a later change or store a question twice',
  area: 'STUDIO',
  kind: 'fix',
  why:
    'A few Studio saves misbehaved when used quickly: a second click stored a question in the bank ' +
    'twice, a retried import added copies, and a change made while a save was running was quietly lost.',
  detail: [
    'Who can open a course: a choice changed while Save was running stays on screen, ready to save.',
    'Save to question bank takes one click at a time and shows it is working.',
    'Importing from a Quiz again after a failure adds only the questions not already in the bank.',
    'The bank question and team dialogs lock their fields while they save.',
  ],
} satisfies ChangelogEntry;
