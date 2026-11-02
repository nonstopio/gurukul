import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-02',
  id: 'MED-06',
  title: 'Educators can upload a PDF into a lesson instead of hosting it first',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'A handout or cheat sheet needed an address, so an Educator had to put it on a drive first, and ' +
    'the lesson broke when that link moved. A PDF uploaded here lives with the course, is checked ' +
    'before it goes up, and is never overwritten, so a published version keeps the file it was ' +
    'published with. A file too big for that still has a clear way out: a GitHub or Google Drive link.',
  detail: [
    'The File block has an Upload tab (the default for a new block) and a Link tab (an existing linked file opens on it).',
    'Choose, drop or paste a PDF. It is checked in the browser, including that it really is a PDF, against the limit the Admin set.',
    'A PDF over the limit says its size, offers a prompt for a coding agent, and a Switch to Link button for GitHub or Google Drive files.',
    'The Label starts as the file name without .pdf and can be changed. Learners see "Label · PDF · 420 KB".',
    'The upload shows progress and can be cancelled; Replace and Remove never delete the old file. The Educator guide has a new Uploading PDFs section.',
  ],
} satisfies ChangelogEntry;
