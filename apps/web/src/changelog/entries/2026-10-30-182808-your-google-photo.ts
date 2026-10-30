import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-30',
  id: 'GOOGLE-PHOTO',
  title: 'Your Google photo shows next to your name',
  area: 'PLATFORM',
  kind: 'feature',
  why:
    'Gurukul already received your Google picture at sign-in but only ever showed your initials, so ' +
    'the account menu looked like a stranger.',
  detail: ['The account menu shows your Google photo; if it cannot load, your initials stay.'],
} satisfies ChangelogEntry;
