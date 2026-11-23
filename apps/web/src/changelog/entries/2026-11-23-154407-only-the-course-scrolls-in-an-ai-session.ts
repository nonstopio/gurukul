import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-23',
  id: 'AI-SESSION-SCROLL',
  title: 'In an Edit with AI session, only the course scrolls',
  area: 'STUDIO',
  kind: 'fix',
  why:
    'Scrolling the course used to move the whole page, so the chat slid under the top bar and ' +
    'the message box drifted. The chat now stays put while you read through the course beside it.',
  detail: [
    'On a wide window the chat fills the height beside the course; its messages scroll inside it.',
    'The Preview, Outline and Sources pane scrolls on its own.',
  ],
} satisfies ChangelogEntry;
