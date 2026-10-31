import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-31',
  id: 'STUDIO-DESKTOP-ONLY',
  title: 'Studio asks for a bigger screen on a phone',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'The editors were cramped and cluttered on a phone. Building a course takes room, so Studio ' +
    'now opens on a laptop or desktop only, until a proper mobile version is designed.',
} satisfies ChangelogEntry;
