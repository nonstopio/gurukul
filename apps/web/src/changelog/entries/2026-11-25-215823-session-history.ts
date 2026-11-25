import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-25',
  id: 'AI-SESSION-HISTORY',
  title: 'The desktop app lists every AI session you have done, so you can go back to any of them',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'Only unfinished sessions were reachable, from the course list. Once you saved or discarded ' +
    'one, there was no way to find what you asked for, what changed or when, even though the ' +
    'session was still on your computer.',
  detail: [
    'Studio has a new Session history page, opened from Session history beside New course with AI. It lists every session on this computer, newest first, with its name, summary, course, when it started and last changed, how long that was, its turns, changes and goals.',
    'Search by name, summary or course, or filter by Open, Saved or Discarded. A session whose files are still here opens its chat and workspace; after 30 days only its record is kept.',
    'It reads files on your computer only. Nothing is sent anywhere.',
  ],
} satisfies ChangelogEntry;
