import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'ACHARYAS-SEE-EVERY-COURSE',
  title: 'Acharyas see every course in Vyasa Studio, not yet published ones too',
  area: 'STUDIO',
  kind: 'fix',
  why:
    'A course another Acharya had started but not published was missing from Vyasa Studio, so ' +
    'nobody could tell a course was already being written before starting the same one.',
  detail: [
    'Courses you do not edit show as "View only", whatever their status.',
    'Their unpublished work stays with the course’s own Acharyas and Kulapatis.',
  ],
} satisfies ChangelogEntry;
