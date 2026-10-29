import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-27',
  id: 'M1-SIGN-IN-SHELL',
  title: 'Sign in with your NonStop Google account and land in the Gurukul app',
  area: 'PLATFORM',
  kind: 'feature',
  why:
    'Everything after this (courses, Quizzes, the console) needs to know who you are and what ' +
    'you may open. Signing in is now the front door, and the sidebar shows each person only the ' +
    'areas their role allows.',
  detail: [
    'Only @nonstopio.com Google accounts get in; a personal Gmail is signed straight back out with a message.',
    'An Admin sees the Admin console; an Educator or Admin sees Studio; everyone else gets a not-allowed page if they type the address.',
    'Anything assigned to your email before your first sign-in is waiting for you when you arrive.',
    'Global search now shows only pages your role can open.',
  ],
} satisfies ChangelogEntry;
