import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-31',
  id: 'STUDIO-PUBLISH-CHECKS',
  title: 'Publishing refuses bad numbers and non-https links, and a retired course stays retired',
  area: 'STUDIO',
  kind: 'fix',
  why: 'Zero questions shown or negative minutes could publish and break grading, file and image links could be javascript: or http:, and Publish or Rollback quietly reopened a retired course.',
} satisfies ChangelogEntry;
