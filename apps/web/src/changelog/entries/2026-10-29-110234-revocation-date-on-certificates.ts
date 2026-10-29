import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'REVOCATION-DATE-ON-CERTIFICATES',
  title: 'A revoked certificate’s verify page says when it was revoked',
  area: 'PARIKSHA',
  kind: 'feature',
  why:
    'Someone checking a certificate needs to know whether it was valid when it was shown to them; ' +
    '"revoked" alone could not tell a certificate withdrawn yesterday from one withdrawn a year ago.',
  detail: [
    'The verify page reads "Revoked on" and the date the Kulapati revoked it.',
    'Restoring a certificate clears the date. Certificates revoked before this change still say only that they were revoked.',
  ],
} satisfies ChangelogEntry;
