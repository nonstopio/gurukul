import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-01',
  id: 'ANALYTICS-PRIVACY',
  title: 'Gurukul now measures how it is used, and you accept a privacy policy to sign in',
  area: 'PLATFORM',
  kind: 'feature',
  why:
    'We could not see which courses help or where people get stuck, so we could not tell what to ' +
    'build next. Measuring use answers that, and asking first keeps it honest.',
  detail: [
    'Signing in asks you to accept the privacy policy, which you can read first at /privacy. ' +
      'Without accepting, you stay signed out and nothing is sent.',
    'We count pages and learning actions: courses started and finished, lessons, Quiz results, ' +
      'certificates. Never your name, email, search words or Quiz answers.',
    'Someone already signed in sees one "Before you continue" page until they accept.',
    'A screen that crashes now shows a plain message with a Reload button.',
  ],
} satisfies ChangelogEntry;
