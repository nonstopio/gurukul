import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-22',
  id: 'AI-CHAT-FILES',
  title: 'Add files to an Edit with AI session by dropping them on the chat',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'The material for a course is usually a Word document, a sheet or a PDF, and the plus button ' +
    'only pointed at the Preview and the Outline. Now you can hand the agent the file itself and ' +
    'say what to make of it.',
  detail: [
    'Drop files anywhere on the chat, paste them into the message box, or choose Add files… from the plus button. Word, Excel, PDF, pictures and text are all accepted, up to 25 MB each and 10 at a time.',
    'Each file shows as a chip above the message box, and the agent is told its name when you send. A file with a name already in the Sources folder is kept as a copy, never overwritten.',
    'The Sources tab shows the new files straight away.',
    'For now the agent reads only text and Markdown files; for the others it asks you for a text copy.',
    'Needs the updated desktop app; an older one shows "Update the app".',
  ],
} satisfies ChangelogEntry;
