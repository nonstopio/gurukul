import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-28',
  id: 'VIDEO-COMING-SOON',
  title: 'A video that is not recorded yet says "Video coming soon"',
  area: 'LEARN',
  kind: 'fix',
  why:
    'The Git course still carries placeholder video links, and the player embedded them as a ' +
    'broken frame that could not be played or marked as watched.',
  detail: [
    'A lesson whose video is not recorded shows "Video coming soon" instead of an empty player.',
    'It does not hold back "Mark complete" while the video is missing.',
  ],
} satisfies ChangelogEntry;
