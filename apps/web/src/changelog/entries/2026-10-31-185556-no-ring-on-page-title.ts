import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-31',
  id: 'GURUKUL-NO-TITLE-RING',
  title: 'Opening a page no longer draws a box around its title',
  area: 'DESIGN',
  kind: 'fix',
  why:
    'After each navigation focus moves to the page title so a screen reader starts there, and the ' +
    'browser drew its default blue outline around it, which looked like the title had been ' +
    'selected. The title is not a control, so nothing is drawn; screen readers still start there.',
  detail: ['Every page, on desktop and on a phone.'],
} satisfies ChangelogEntry;
