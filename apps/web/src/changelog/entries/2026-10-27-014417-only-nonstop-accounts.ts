import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-27',
  id: 'GURUKUL-DOMAIN-LOCK',
  title: 'Only verified @nonstopio.com accounts can read or write anything',
  area: 'PLATFORM',
  kind: 'security',
  why:
    'Google sign-in will happily create an account for any Gmail address. The database itself now ' +
    'refuses every request that does not come from a verified NonStop account, so hiding a button ' +
    'is never the only thing standing between a stranger and learner data.',
  detail: [
    'A personal Gmail, an unverified address or a look-alike domain such as nonstopio.com.evil.io is refused.',
    'Each of those cases has a test that runs against the Firestore emulator on every pull request.',
  ],
} satisfies ChangelogEntry;
