import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-20',
  id: 'AI-SESSIONS-ATTACH',
  title: 'Point the agent at the block you mean',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'Saying which paragraph you mean in words is slow and easy to get wrong. Attach the block, ' +
    'question or lesson itself, and "make this shorter" is enough. You can also check and change ' +
    'which folder of notes the agent reads without leaving the session.',
  detail: [
    'In the desktop app, Attach appears beside each block and question of the preview when you point at it or tab to it, and on each chapter, lesson and Quiz in the outline.',
    'What you attach shows above the message box, where you can remove it, and stays with the message in the chat once sent.',
    'The Sources tab shows the session’s folder and its files, lets you choose or change it, and opens it in Finder or Explorer. What the agent reads is sent to Anthropic under your own Claude account.',
  ],
} satisfies ChangelogEntry;
