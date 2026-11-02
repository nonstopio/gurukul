import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-02',
  id: 'MED-03',
  title: 'Lesson images can be small, framed or opened full size',
  area: 'LEARN',
  kind: 'feature',
  why:
    'Every image filled the whole lesson column, so a logo or a phone screenshot looked huge and a ' +
    'detailed diagram was too small to read. Educators now choose the size, and learners can open ' +
    'the image at its real size.',
  detail: [
    'Studio\'s Image block has Layout (Column, Medium or Small), "Open full size" and Border, for linked images too.',
    'Open full size shows the image at its natural size in a window you can scroll; Escape closes it.',
    'An image that cannot load shows its description instead of a broken-image icon, and pages no longer jump while images load.',
    'An uploaded PDF link reads "Label · PDF · 420 KB" and opens in a new tab.',
  ],
} satisfies ChangelogEntry;
