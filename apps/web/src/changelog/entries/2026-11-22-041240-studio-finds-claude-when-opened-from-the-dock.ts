import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-22',
  id: 'STUDIO-FINDS-CLAUDE-FROM-DOCK',
  title: 'The desktop app finds Claude Code when you open it from the Dock',
  area: 'STUDIO',
  kind: 'fix',
  why:
    'Opened from the Dock, Finder or a Linux launcher, the app said Claude Code was not on this ' +
    'computer even though it worked in your terminal, because it did not see the folders your ' +
    'terminal does. It now looks where your terminal looks, so the chat opens without you having ' +
    'to start the app from a terminal.',
  detail: [
    'At start-up the app asks your login shell for its folders, and uses them to find Claude Code and to run it.',
    'If that takes more than five seconds or fails, it still checks the usual install places, such as ~/.local/bin.',
  ],
} satisfies ChangelogEntry;
