import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-01',
  id: 'AUDIT-LOG-PAGES',
  title: 'The audit log shows when each action happened and pages through 25 entries at a time',
  area: 'ADMIN',
  kind: 'feature',
  why: 'A date alone could not tell you which of two changes on the same day came first, and one long list got slower to open as the log grew. Each entry now has its time, and the log opens one page at a time.',
  detail: [
    'The When column shows the day and the time, in your own time zone.',
    'Use Previous and Next under the table; the page shows 25 entries and how many there are in all.',
  ],
} satisfies ChangelogEntry;
