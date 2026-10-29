import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'KEYBOARD-SHORTCUTS',
  title: 'Press ? to see the keyboard shortcuts',
  area: 'LEARN',
  kind: 'feature',
  why:
    'The J and K keys in a lesson and the number keys in a Quiz worked, but nothing told you ' +
    'they were there.',
  detail: [
    'Press ? on any page to list them; Escape closes the list.',
    'It stays out of the way while you are typing in a field.',
  ],
} satisfies ChangelogEntry;
