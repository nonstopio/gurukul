import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-21',
  id: 'AI-SESSIONS-OLD-DRAFT',
  title: 'Edit with AI starts on a course whose draft was saved a while ago',
  area: 'STUDIO',
  kind: 'fix',
  why:
    'Starting a session on a course such as Project Management 101 failed with "The session did ' +
    'not start". The draft had been saved before the last course-format update, and the session ' +
    'refused it instead of bringing it up to date the way Publish does.',
  detail: ['An older draft is now brought up to the current format when the session starts.'],
} satisfies ChangelogEntry;
