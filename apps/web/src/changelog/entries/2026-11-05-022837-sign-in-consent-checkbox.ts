import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-05',
  id: 'SIGNIN-CONSENT-CHECKBOX',
  title: 'Accepting the privacy policy is a tick box',
  area: 'LEARN',
  kind: 'fix',
  why:
    'A switch reads as a setting you can turn off later; agreeing to a policy before you sign in ' +
    'is a one-time tick. The "NonStop Academy" line above the welcome is gone too, so the page ' +
    'opens on "Welcome to Gurukul.", and the line at the foot now reads "Never stop learning, never ' +
    'stop teaching", for Educators as much as Learners.',
} satisfies ChangelogEntry;
