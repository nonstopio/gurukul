import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'ASSIGNED-BY',
  title: 'Home says who assigned the course you are continuing',
  area: 'LEARN',
  kind: 'feature',
  why:
    'A course that lands on you from an Admin is easier to prioritise when you know who asked. ' +
    'The name now sits on the continue card instead of leaving you to ask around.',
  detail: [
    'New assignments show "Assigned by" and the Admin name on the Home continue card.',
    'Assignments made before this change carry no name, so they show nothing there.',
  ],
} satisfies ChangelogEntry;
