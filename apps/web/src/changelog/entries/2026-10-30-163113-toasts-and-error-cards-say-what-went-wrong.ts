import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-30',
  id: 'FEEDBACK-ERRORS',
  title: 'When something fails, Gurukul says what went wrong and what to do next',
  area: 'PLATFORM',
  kind: 'feature',
  why:
    'A failed save used to show one short line that vanished after a few seconds, so people missed it ' +
    'and could not tell a lost connection from a missing permission.',
  detail: [
    'Errors now stay until you close them, with a plain sentence, a short code you can quote to an Admin, and Retry when trying again can work.',
    'Notices fade away on their own, and the timer pauses while you hover or focus on one.',
  ],
} satisfies ChangelogEntry;
