import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-22',
  id: 'AI-SESSIONS-NO-DIALOG',
  title: 'Edit with AI and New course with AI open the session at once',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'The start dialog asked what you wanted before you had seen the session, and a folder to pick ' +
    'before the agent could read your notes. You now land in the session and say what you want ' +
    'in its own message box, the way you would in any chat, and your notes folder is already waiting.',
  detail: [
    'Edit with AI opens the session straight away, or the one you already have open on that course.',
    'New course with AI opens the new course you started and have not worked in yet, instead of adding another empty one.',
    'Every session has its own Sources folder under Documents/Gurukul Studio, made for you. The Sources tab shows where it is and how to open it; there is no folder to choose.',
    'The note that the course and what you write go to Anthropic, so client names and internal documents stay out, now sits under the message box.',
    'The desktop app updates itself. If yours has not yet, Studio asks you to update it before opening a session.',
  ],
} satisfies ChangelogEntry;
