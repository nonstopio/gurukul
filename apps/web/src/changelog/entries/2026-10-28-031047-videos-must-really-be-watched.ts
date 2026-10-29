import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-28',
  id: 'VIDEO-WATCH',
  title: 'A video lesson completes once you have watched 90% of the video',
  area: 'LEARN',
  kind: 'feature',
  why:
    'A lesson set to complete "after 90% of the video" only asked learners to tick a box, and ' +
    'the course setting "Require watching videos" did nothing in the player, so an Educator could ' +
    'not rely on either. Now the player itself counts what has been played.',
  detail: [
    'YouTube and Loom videos show how much you have watched; "Mark complete" turns on at 90%. Skipping ahead does not count.',
    'With "Require watching videos" on, every lesson with a video waits for it, whatever its completion setting.',
    'A disabled "Mark complete" now says what it is waiting for.',
    'Google Drive videos, and players that cannot be reached, still ask you to confirm you watched the video.',
  ],
} satisfies ChangelogEntry;
