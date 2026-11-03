import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-03',
  id: 'LINK-PREVIEWS',
  title: 'Gurukul links show a proper preview when shared',
  area: 'PLATFORM',
  kind: 'feature',
  why:
    'A Gurukul link pasted into Slack, WhatsApp or mail showed a bare address, so people could not ' +
    'tell what it was before opening it. It now previews with the Gurukul name, a one-line ' +
    'description and the logo. Search engines are also told to skip the signed-in pages, which ' +
    'only ever showed them the sign-in screen.',
} satisfies ChangelogEntry;
