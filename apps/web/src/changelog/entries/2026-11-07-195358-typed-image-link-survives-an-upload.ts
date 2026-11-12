import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-07',
  id: 'LINK-DURING-UPLOAD',
  title: 'An address typed during an upload is the one the lesson keeps',
  area: 'STUDIO',
  kind: 'fix',
  why:
    'An Educator who started uploading an image or a PDF, then switched to Link and typed another ' +
    'address, lost that address when the upload finished: the uploaded file quietly took its place in the draft.',
  detail:
    'On Image and File blocks, typing an address on the Link tab now stops any upload still running and forgets a file being checked, shrunk or waiting to be uploaded.',
} satisfies ChangelogEntry;
