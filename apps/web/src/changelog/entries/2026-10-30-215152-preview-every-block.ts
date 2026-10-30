import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-30',
  id: 'STUDIO-PREVIEW-BLOCKS',
  title: 'Every lesson block has an Edit | Preview switch in Studio',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'Only text blocks could show how they would look to a learner, so an Educator editing a callout, ' +
    'question or code block had to open the whole lesson preview to find out.',
  detail: ['The switch shows which view you are in: Edit, or Preview as a learner sees it.'],
} satisfies ChangelogEntry;
