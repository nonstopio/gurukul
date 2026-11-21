import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-22',
  id: 'AI-CHAT-BAR',
  title: 'Pick the model and effort for an Edit with AI session',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'A quick fix and a whole new course do not need the same amount of thinking, and you had no way ' +
    'to say so. The bar under the message box lets you choose, and shows how much of the ' +
    "conversation's room is used before the agent starts to forget the start of it.",
  detail: [
    'Model (Opus, Sonnet, Haiku) and Effort (Low, Medium, High) sit under the message box; Default leaves it to Claude Code. A change applies to your next message and keeps the chat.',
    'A ring and a percentage show how full the conversation is, after the first reply.',
    "A folder button shows the session's Sources folder in Finder or Explorer.",
    'A Skills menu lists what the agent knows how to do. It is read-only.',
    'Needs the updated desktop app; an older one shows "Update the app".',
  ],
} satisfies ChangelogEntry;
