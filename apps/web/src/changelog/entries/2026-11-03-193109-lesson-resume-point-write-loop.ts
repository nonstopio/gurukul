import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-03',
  id: 'RESUME-POINT-LOOP',
  title: 'A course open in two places no longer rewrites your place every second',
  area: 'LEARN',
  kind: 'fix',
  why:
    'With a course open on two lessons at once, say in two tabs or on a laptop and a phone, each one ' +
    'kept moving "where you left off" back to its own lesson, every second, for as long as both stayed open.',
  detail: [
    'Opening a lesson records it as where you left off once.',
    'Moving on in another tab or device no longer starts a tug of war over it.',
  ],
} satisfies ChangelogEntry;
