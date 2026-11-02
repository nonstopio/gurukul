import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-02',
  id: 'MED-07',
  title: 'Admins can set how large an uploaded image or PDF may be',
  area: 'ADMIN',
  kind: 'feature',
  why:
    'Files Educators upload into lessons count against the storage quota, so the organisation ' +
    'needs a say in how big they may be. A limit set once in Org settings applies to every ' +
    'Educator, with no code change.',
  detail: [
    'Org settings has an Uploads card with "Largest image (KB)" and "Largest PDF (KB)". They start at 500 and 1024.',
    'A limit can go as low as 50 KB and no higher than 1024 KB, the ceiling for every upload.',
    'Lowering a limit affects new uploads only; files already in lessons stay.',
  ],
} satisfies ChangelogEntry;
