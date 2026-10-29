import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'EDUCATORS-SEE-EVERY-COURSE',
  title: 'Educators see every course in Studio, not yet published ones too',
  area: 'STUDIO',
  kind: 'fix',
  why:
    'A course another Educator had started but not published was missing from Studio, so ' +
    'nobody could tell a course was already being written before starting the same one.',
  detail: [
    'Courses you do not edit show as "View only", whatever their status.',
    'Their unpublished work stays with the course’s own Educators and Admins.',
  ],
} satisfies ChangelogEntry;
