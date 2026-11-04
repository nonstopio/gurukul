import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-04',
  id: 'SIGN-OUT-CLEARS',
  title: 'Signing out clears what this browser kept of your Gurukul data',
  area: 'PLATFORM',
  kind: 'fix',
  why:
    'Gurukul keeps a copy of your courses and unsent progress in the browser so it works on a ' +
    'bad connection. When that copy got stuck, signing out and back in brought the same stuck ' +
    'copy back, so progress never saved and every page stayed slow. Now signing out really ' +
    'starts you fresh, and a shared computer keeps nothing of yours.',
  detail: [
    'Sign-out waits a moment for any unsaved progress to reach Gurukul, then deletes the copy in this browser.',
    'Progress still not saved by then is dropped, so sign out once you are back online.',
    'Close other Gurukul tabs before signing out: the copy cannot be deleted while another tab is using it.',
  ],
} satisfies ChangelogEntry;
