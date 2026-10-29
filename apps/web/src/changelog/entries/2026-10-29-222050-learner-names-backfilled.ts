import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'LEARNER-NAMES-BACKFILLED',
  title: 'Studio Analytics names every learner, with their current name',
  area: 'STUDIO',
  kind: 'fix',
  why:
    'People who started a course before learner names were kept showed as "Name not recorded", and ' +
    'a learner who changed their name kept the old one, so an Educator could not tell who was who.',
  detail: [
    'The nightly count fills in the missing names and copies a changed name, so both appear by the next day.',
  ],
} satisfies ChangelogEntry;
