import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-21',
  id: 'AI-SESSIONS-PUBLISHED',
  title: 'Edit with AI works on a course that is already published',
  area: 'STUDIO',
  kind: 'fix',
  why:
    'Starting a session in the Gurukul Studio app on a published course went straight to "This ' +
    'session is not on this computer", so the courses most worth improving could not be edited ' +
    'with AI at all. The session was saved; the app could not read the publish date back from it.',
  detail: [
    'A session on a published course now opens, and Save to draft keeps the course’s publish date as it was.',
  ],
} satisfies ChangelogEntry;
