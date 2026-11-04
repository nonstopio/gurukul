import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-04',
  id: 'REPORT-ISSUE-TOAST',
  title: 'Report issue in an error message looks like a button',
  area: 'PLATFORM',
  kind: 'fix',
  why:
    'On the red error message, Report issue was plain text sitting off to one side, so it was easy ' +
    'to miss that you could click it.',
  detail: ['It now has the same outlined button as Report issue everywhere else.'],
} satisfies ChangelogEntry;
