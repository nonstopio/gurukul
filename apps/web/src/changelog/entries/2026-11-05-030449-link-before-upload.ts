import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-05',
  id: 'LINK-BEFORE-UPLOAD',
  title: 'Image and File blocks open on Link',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'Linking an image or file keeps Storage small, so Studio now leads with it and leaves ' +
    'Upload for when there is nothing to link to.',
  detail: [
    'Link is the first tab and where a new Image or File block opens, with an empty address field.',
    'A block whose image or PDF was uploaded still opens on Upload.',
  ],
} satisfies ChangelogEntry;
