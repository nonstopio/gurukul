import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-04',
  id: 'REPORT-ISSUE-TOAST',
  title: 'Report issue looks like a button, with the GitHub mark',
  area: 'PLATFORM',
  kind: 'fix',
  why:
    'On the red error message, Report issue was plain text sitting off to one side, so it was easy ' +
    'to miss that you could click it.',
  detail: [
    'In an error message it now has the same outlined button as Report issue everywhere else.',
    'Every Report issue button shows the GitHub mark, since that is where the report opens.',
  ],
} satisfies ChangelogEntry;
