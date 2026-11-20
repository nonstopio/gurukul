import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-19',
  id: 'AI-SESSIONS-START',
  title: 'Educators in the Gurukul Studio app can start a session to build a course with AI',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'Building a course by chatting starts with saying what you want; the session keeps that goal ' +
    'and a copy of the draft on your computer, so nothing reaches the draft until you review ' +
    'the changes and save them, and closing the app loses nothing.',
  detail: [
    'In the desktop app, the course list has New course with AI, and each course you can edit has Edit with AI.',
    'One open session per course: starting another offers to open the one you have.',
    'Sessions are found in search inside the app. In a browser, Studio is unchanged, and a session link says it needs the app.',
    'The chat and the live preview come in a later update; for now a session shows its title and goal.',
  ],
} satisfies ChangelogEntry;
