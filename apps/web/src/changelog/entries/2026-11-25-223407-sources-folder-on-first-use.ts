import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-25',
  id: 'AI-SOURCES-FIRST-USE',
  title: 'Opening an AI session no longer leaves an empty folder in your Documents',
  area: 'STUDIO',
  kind: 'fix',
  why:
    'Every AI session made its Sources folder the moment it opened, so trying New course with AI ' +
    'and leaving it filled Documents/Gurukul Studio with empty new-course folders nobody asked for.',
  detail: [
    'A session makes its Sources folder the first time you use it: your first message, the Sources tab, Show in Finder, or files you add to the chat.',
    'Your first message in a new session can take a second or two longer, once, while the agent starts.',
    'When a session is cleaned up, its Sources folder goes with it if it is still empty and no other session uses it. A folder with anything in it is never removed.',
  ],
} satisfies ChangelogEntry;
