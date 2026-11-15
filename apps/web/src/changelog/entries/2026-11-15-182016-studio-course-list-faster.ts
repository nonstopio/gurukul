import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-15',
  id: 'STUDIO-LIST-FASTER',
  title: 'Studio pages and the first search open faster',
  area: 'STUDIO',
  kind: 'fix',
  why: 'Every visit to Studio, Media or the Question bank, and the first search of a session, re-read every course, its whole draft and its learner count, so a long course list made each of them wait on hundreds of reads.',
  detail: [
    "Studio's course list is remembered for five minutes, and clears at once when you save a draft, create, publish, roll back, archive or change access. A colleague's edit can take up to five minutes to show.",
    'Search lists the courses you can edit by the title and summary of the published course, read without opening any drafts. A course never published, or renamed in the editor since its last publish, keeps its old name in search until it is published.',
  ],
} satisfies ChangelogEntry;
