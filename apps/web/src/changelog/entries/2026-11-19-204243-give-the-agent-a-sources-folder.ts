import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-19',
  id: 'AI-SESSIONS-SOURCES',
  title: 'An AI session can read a folder of your own notes',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'A course is better when it starts from what you already wrote: outlines, talk transcripts, ' +
    'old slides saved as text. The agent can now read the files you put in one folder, and ' +
    'nothing else on your computer.',
  detail: [
    'When you start a session in the desktop app, Choose a Sources folder picks the folder; it starts in Documents/Gurukul Studio, in a folder named after the course.',
    'The agent reads text files only (Markdown, plain text, CSV, JSON, subtitles, code), up to 1 MB each, and only those directly in that folder.',
    'What it reads is sent to Anthropic under your own Claude account, like the course, so leave out client names and internal documents.',
  ],
} satisfies ChangelogEntry;
