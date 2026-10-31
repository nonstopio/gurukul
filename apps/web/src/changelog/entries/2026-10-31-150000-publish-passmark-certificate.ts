import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-31',
  id: 'STUDIO-PUBLISH-PASSMARK-CERT',
  title: 'Publishing needs a pass mark above 0 and a Quiz behind every certificate',
  area: 'STUDIO',
  kind: 'fix',
  why: 'A 0% pass mark let every attempt pass, and a course with a certificate but no Quiz handed one out for clicking through lessons.',
} satisfies ChangelogEntry;
