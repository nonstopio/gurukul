import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-15',
  id: 'PAGES-OPEN-AT-ONCE',
  title: 'Pages you have already opened show up straight away',
  area: 'LEARN',
  kind: 'fix',
  why: 'Going Home, then Courses, then Home again showed a loading screen every time, even though nothing had changed, so the app felt slower than it was.',
  detail: [
    'Home, the catalogue, your certificates, the up-next card and your learning summary now show what they showed last time and refresh quietly in the background. If the refresh fails, you keep what you had. Signing out forgets it all.',
  ],
} satisfies ChangelogEntry;
