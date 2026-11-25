import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-25',
  id: 'AI-PASTED-MEDIA',
  title:
    'In an AI session, a video, picture or embed link you paste in the chat goes into the lesson',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'You pasted a YouTube or Loom link and asked for it after the intro, and the AI could only ' +
    'leave you a to-do, so you added every video block by hand. It still never makes up a link: ' +
    'only the ones you typed in that session count.',
  detail: [
    'Paste a YouTube, Loom or Google Drive video, an https picture or an allowed embed (CodeSandbox, StackBlitz and the video hosts) and say where it goes. Review lists the new block like any other change, and you can undo it.',
    'A picture gets alt text written from the lesson; check it in Review.',
    'Files such as PDFs, and media you gave no link for, are still left as to-dos for you.',
  ],
} satisfies ChangelogEntry;
