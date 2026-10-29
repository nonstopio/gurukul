import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'SPLIT-LESSON-LAYOUT',
  title: 'Split lessons keep the video beside the text',
  area: 'LEARN',
  kind: 'feature',
  why:
    'A lesson an Educator set to Split used to look the same as Stacked, so you scrolled the video ' +
    'away while reading the steps that go with it.',
  detail: [
    'On a wide screen the video takes the left side and stays in view while the text scrolls.',
    'On a narrow screen the lesson stacks as before.',
  ],
} satisfies ChangelogEntry;
