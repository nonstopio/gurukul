import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-04',
  id: 'CSV-PICKER-FILEDROP',
  title: 'Uploading a CSV in Assign courses looks like every other upload',
  area: 'ADMIN',
  kind: 'fix',
  why:
    'The CSV picker was the browser’s bare file box stretched inside a dashed frame, with a ' +
    'second line of instructions, so it looked broken next to the rest of the console.',
  detail: ['One button to choose, drop or paste a CSV, with the format stated underneath.'],
} satisfies ChangelogEntry;
