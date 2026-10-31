import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-31',
  id: 'CERT-WAX-SEAL',
  title: 'Certificates have a new look, with the course title first and a green wax seal',
  area: 'LEARN',
  kind: 'feature',
  why:
    'A certificate is shared to say what someone learned, so the course should be the line people ' +
    'read first. The old sheet put the name first and looked like a dated diploma; the new one keeps ' +
    'the traditional layout on a lighter ground and adds a seal that reads as a real stamp.',
  detail: [
    'The course title is now the largest line; the learner name sits above it in a smaller type.',
    'A green wax seal replaces the flat seal, on certificates and on the sign-in page.',
    'Long course titles and names shrink to fit, and a revoked certificate still says so in words.',
  ],
} satisfies ChangelogEntry;
