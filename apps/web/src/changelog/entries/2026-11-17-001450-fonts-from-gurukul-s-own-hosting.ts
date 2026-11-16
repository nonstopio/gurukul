import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-17',
  id: 'GH-131',
  title: 'Gurukul’s typefaces now come from Gurukul itself',
  area: 'PLATFORM',
  kind: 'fix',
  why:
    'The headings, body text and code faces were fetched from Google Fonts, so every first visit ' +
    'waited on two outside servers, and on a slow or filtered network the page stayed in a ' +
    'stand-in font, then jumped when the real one arrived, or never changed at all.',
  detail: [
    'Text switches to the real typeface sooner on a first visit, and the change works on networks that block Google Fonts.',
  ],
} satisfies ChangelogEntry;
