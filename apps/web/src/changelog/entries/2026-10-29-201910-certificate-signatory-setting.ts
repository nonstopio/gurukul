import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'CERT-SIGNATORY',
  title: 'Admins choose who signs certificates in Org settings',
  area: 'ADMIN',
  kind: 'feature',
  why:
    'The person who signs certificates is an organisation decision, not something each Educator ' +
    'should retype per course, and it changes when people change roles. One setting keeps every ' +
    'course in step.',
  detail: [
    'Org settings has a Certificate signatory section with a name and a role.',
    'Certificates issued from then on print it; ones already issued keep the signatory they were issued with.',
    'Studio no longer asks for a signatory on a course; its Certificate tab keeps the title.',
  ],
} satisfies ChangelogEntry;
