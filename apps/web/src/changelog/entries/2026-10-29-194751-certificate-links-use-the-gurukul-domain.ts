import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'OPS-18',
  title: 'Certificate and course links can use the gurukul.nonstopio.com address',
  area: 'PLATFORM',
  kind: 'ops',
  why:
    'A certificate is shared for years, so its verify link should live at the NonStop domain and ' +
    'not at a Firebase address that could change. The address is now one setting instead of being ' +
    'written into the code.',
  detail: [
    'Verify links on certificates and the emailed course links both follow the configured address.',
    'Until the domain is connected, links keep using the current address.',
  ],
} satisfies ChangelogEntry;
