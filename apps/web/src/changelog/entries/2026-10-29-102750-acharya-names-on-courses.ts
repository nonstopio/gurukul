import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'ACHARYA-NAMES-ON-COURSES',
  title: 'Vyasa Studio names the Acharyas of each course',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'A "View only" course said nothing about who was writing it, and the edit-access list showed ' +
    'account ids, so there was no way to know whom to talk to about a course.',
  detail: [
    'Courses you do not edit say "View only — Acharya: Asha Rao".',
    'The course details list Acharyas by name instead of by account id.',
    'Acharyas granted before this change get their name the next time a Kulapati saves their access.',
  ],
} satisfies ChangelogEntry;
