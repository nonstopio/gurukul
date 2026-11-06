import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-06',
  id: 'ASSIGNED-BY-NAME',
  title: 'Home shows who assigned your course',
  area: 'LEARN',
  kind: 'fix',
  why:
    'Every assignment was saved without the assigner’s name, so a learner looking at a course on ' +
    'Home could not tell whose request it was or whom to ask about it.',
  detail: [
    'New assignments carry the assigner’s Google name, or the name on their profile when Google gives none.',
    'Assignments made before this fix still show no name; assigning the course again does not change them.',
  ],
} satisfies ChangelogEntry;
