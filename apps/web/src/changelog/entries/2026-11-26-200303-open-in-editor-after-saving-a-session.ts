import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-26',
  id: 'AI-SESSION-SAVED-EDITOR',
  title: 'Open in editor stays on an AI session after you save it to the draft',
  area: 'STUDIO',
  kind: 'fix',
  why:
    'Saving closed the session, and with it every Open in editor button, so a course just ' +
    'built with AI could not be picked up again from where you were reading it.',
  detail: [
    'On a saved session, Open in editor on the preview, each Outline row and each Review row opens Studio’s lesson editor or Quiz builder on the saved draft.',
    'A discarded session still offers none: nothing of it was saved.',
  ],
} satisfies ChangelogEntry;
