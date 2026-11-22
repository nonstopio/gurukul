import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-22',
  id: 'AI-READ-FILES',
  title: 'The AI reads Word, Excel, PDF and pictures you give it',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'Files you dropped on the chat were copied in, but the agent could only read text, so it ' +
    'asked you for a text copy of your own document. Now it reads the file you gave it.',
  detail: [
    'Word (.docx) files are read with their headings, Excel (.xlsx) files one sheet at a time, and PDFs as text. A scanned PDF has no text to read, so it asks for another copy.',
    'Pictures (.png, .jpg, .gif, .webp, up to 3 MB) are shown to the agent, so it can follow a diagram or a screenshot.',
    'Word, Excel and PDF files can be up to 25 MB. Very long ones are cut after about 200,000 characters and the agent says so. Old .doc and .xls files are still not read.',
    'Needs the updated desktop app; an older one shows "Update the app".',
  ],
} satisfies ChangelogEntry;
