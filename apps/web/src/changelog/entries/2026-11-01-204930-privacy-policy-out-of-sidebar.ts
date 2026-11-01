import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-01',
  id: 'PRIVACY-NOT-IN-SIDEBAR',
  title: 'The privacy policy is no longer in the sidebar',
  area: 'PLATFORM',
  kind: 'chore',
  why: 'The sidebar is for places you work in; the policy is something you read once, at sign-in, so it sat there taking a permanent slot.',
  detail: ['The policy stays at /privacy and is linked from the sign-in screen.'],
} satisfies ChangelogEntry;
