import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-30',
  id: 'STUDIO-MEDIA-GALLERY',
  title: 'The Media library is a gallery with previews, search and a detail panel',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'A list of bare links made it hard to tell one image or PDF from another, so Educators ' +
    'pasted links again instead of reusing what a course already had.',
  detail: [
    'Each image shows a thumbnail; videos, PDFs, audio and embeds get a typed tile. Every tile says in how many courses it is used.',
    'Search by name, link or course, and filter by type.',
    'Choose a tile to see a larger preview, the lessons that use it, and Copy link.',
  ],
} satisfies ChangelogEntry;
