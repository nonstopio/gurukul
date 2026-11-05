import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-05',
  id: 'SIGN-IN-BUILT-BY',
  title: 'The sign-in page shows who built Gurukul and where to report a problem',
  area: 'PLATFORM',
  kind: 'feature',
  why:
    'Someone stuck at sign-in was pointed at a mailbox; a GitHub issue reaches the people who ' +
    'build Gurukul directly, and anyone can see it was fixed.',
  detail: [
    'The open-source line from the foot of the app now takes turns on the sign-in page too, with its link to open an issue.',
    'The people who built Gurukul appear beside it.',
    'The gurukul@nonstopio.com line under the sign-in button is gone.',
  ],
} satisfies ChangelogEntry;
