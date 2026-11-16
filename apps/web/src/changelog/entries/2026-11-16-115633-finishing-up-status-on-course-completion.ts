import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-16',
  id: 'GH-121',
  title: 'Finishing a course says "Finishing up…" instead of "Not finished yet"',
  area: 'QUIZ',
  kind: 'fix',
  why: 'The server confirms a finished course a few seconds after your last lesson or Quiz, so the completion page used to read as a failure at the moment of success. It now says it is still saving, and only says "Not finished yet" when items really are open.',
  detail: [
    'Right after the last item, and while the page loads, you see "Finishing up…" and the completion screen replaces it by itself.',
    'If it takes longer than about fifteen seconds (for example you are offline), the page says so calmly and keeps a "Back to the course" button.',
  ],
} satisfies ChangelogEntry;
