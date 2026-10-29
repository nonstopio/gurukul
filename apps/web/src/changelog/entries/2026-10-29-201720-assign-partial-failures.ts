import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'ASSIGN-PARTIAL-FAILURES',
  title: 'Assigning tells you exactly what did not go through, and previews each course',
  area: 'ADMIN',
  kind: 'fix',
  why:
    'One failed write used to look like the whole assignment failed, so you could not tell who had ' +
    'the course and who did not, and a person holding one of two courses was not shown as such.',
  detail: [
    'If some assignments cannot be saved, the rest still go through and the screen lists each person and course that failed, with a Retry that sends only those.',
    'With several courses chosen, the summary counts new and already-assigned people for each course.',
  ],
} satisfies ChangelogEntry;
