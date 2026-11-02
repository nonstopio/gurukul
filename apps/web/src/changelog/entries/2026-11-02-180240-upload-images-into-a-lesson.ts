import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-02',
  id: 'MED-05',
  title: 'Educators can upload an image into a lesson instead of hosting it first',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'An image needed an address, so an Educator had to put it on a drive or another site first, and ' +
    'a lesson broke whenever that link was moved. A file uploaded here lives with the course, is ' +
    'checked before it goes up, and is never overwritten, so a published version and a rollback ' +
    'keep showing the picture they were published with.',
  detail: [
    'The Image block has an Upload tab (the default for a new block) and a Link tab (an existing linked image opens on it).',
    'Choose, drop or paste a WebP, PNG or JPEG. It is checked in the browser against the limits the Admin set, and previewed in the lesson at 1280 or 390 px before anything uploads.',
    'A file that does not fit says what is wrong in numbers, and offers a prompt to paste into a coding agent and a guide to shrinking it by hand. A narrow image only gets a warning.',
    'The upload shows its progress and can be cancelled. If it fails nothing is saved and you can try again. Replace uploads a new file; Remove clears the block. Neither deletes the old file.',
    'The Educator guide explains the limits and what must never be uploaded: personal data, client names and secrets.',
  ],
} satisfies ChangelogEntry;
