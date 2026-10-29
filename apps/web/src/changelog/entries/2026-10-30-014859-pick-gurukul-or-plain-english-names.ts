import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-30',
  id: 'LABEL-SETS',
  title: 'Choose Gurukul names or plain English',
  area: 'PLATFORM',
  kind: 'feature',
  why:
    'The Sanskrit names suit NonStop Academy but not everyone who reads the app, and not every ' +
    'team that adopts this open-source project. Now each person picks the names they read; the ' +
    'code and data use plain English names throughout.',
  detail: [
    'On first sign-in Gurukul asks: Shishya, Acharya, Kulapati, Parva, Pariksha, or Learner, ' +
      'Educator, Admin, Chapter, Quiz.',
    'Switch at any time from the sidebar.',
    'Console addresses moved from /kulapati to /admin.',
    'Emails and the changelog history use the plain English names.',
  ],
} satisfies ChangelogEntry;
