import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-24',
  id: 'AI-SESSIONS-IN-PROGRESS',
  title:
    'Studio lists the AI sessions you have not finished, so a new course is never out of reach',
  area: 'STUDIO',
  kind: 'fix',
  why:
    'A course built with AI lives only on your computer until you create it from Review. Once you ' +
    'left its session there was no way back from Studio, so hours of work looked lost even though ' +
    'every change was still kept.',
  detail: [
    'In the desktop app, Sessions in progress sits above your courses: each open session, newest first, with when it last changed. Choose one to carry on where you left it.',
    'A new course is marked not created yet until you choose Create course and save draft in its Review.',
  ],
} satisfies ChangelogEntry;
