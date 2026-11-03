import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-03',
  id: 'CERT-GALLERY',
  title: 'Your certificates show as a gallery of the certificates themselves',
  area: 'LEARN',
  kind: 'feature',
  why:
    'The Certificates page was a plain list of names and ids, so you could not see what you had ' +
    'earned without opening each one. Each certificate now shows as a tile, like a course does.',
  detail: [
    'Each tile shows the certificate on top and the course, credential id and date underneath. Click anywhere on it to open it.',
    'A revoked certificate is marked on its tile.',
    'Twelve to a page.',
  ],
} satisfies ChangelogEntry;
