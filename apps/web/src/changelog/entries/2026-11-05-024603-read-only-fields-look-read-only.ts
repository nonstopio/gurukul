import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-05',
  id: 'READ-ONLY-FIELDS',
  title: 'Read-only fields no longer look like text boxes',
  area: 'DESIGN',
  kind: 'fix',
  why:
    'People tried to type into a course’s address in Studio, because a value you can only read ' +
    'looked exactly like one you can edit. Read-only fields now have no box, just a dashed outline ' +
    'and the value in full contrast, so you can still select and copy it.',
} satisfies ChangelogEntry;
