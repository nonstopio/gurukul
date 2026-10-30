import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-30',
  id: 'CHECK-INSTANT',
  title: 'Check questions in a lesson answer as soon as you pick',
  area: 'LEARN',
  kind: 'feature',
  why:
    'Answering a check question meant picking an option and then pressing a separate Show the answer ' +
    'button, and Mark complete scolded you if you had not. That is a click nobody needs while learning.',
  detail: [
    'Pick an option and it is marked right or wrong at once.',
    'A wrong pick says so and lets you try another; the right one shows the explanation.',
  ],
} satisfies ChangelogEntry;
