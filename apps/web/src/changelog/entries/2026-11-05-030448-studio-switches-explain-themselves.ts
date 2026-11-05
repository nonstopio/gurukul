import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-05',
  id: 'STUDIO-SWITCHES-EXPLAINED',
  title: 'Studio switches say what they do',
  area: 'STUDIO',
  kind: 'fix',
  why:
    'Educators could not tell what switches like Terminal style or Shuffle answer order change ' +
    'for learners without publishing and looking.',
  detail: [
    'Code blocks: Copy button and Terminal style each have a line under them.',
    'Video blocks: Captions are available says where learners see it.',
    'Quiz settings: Shuffle answer order says it reshuffles on every attempt.',
  ],
} satisfies ChangelogEntry;
