import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'PEOPLE-IN-SEARCH',
  title: 'Kulapatis can find a person from search',
  area: 'KULAPATI',
  kind: 'feature',
  why:
    'Checking on one learner meant opening Learners and searching there first; now typing the ' +
    'start of their name or email in search (Ctrl K or ⌘K) opens their learner drawer from anywhere.',
  detail: [
    'Anyone who has signed in, shown with their email and team.',
    'Only Kulapatis see people in search; it starts from two letters, once typing pauses.',
  ],
} satisfies ChangelogEntry;
