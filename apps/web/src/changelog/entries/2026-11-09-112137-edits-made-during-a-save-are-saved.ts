import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-09',
  id: 'DRAFT-SAVE-WHILE-SAVING',
  title: 'Edits made while the draft is saving are saved too',
  area: 'STUDIO',
  kind: 'fix',
  why:
    'On a slow connection, edits typed while an earlier save was still on its way were left ' +
    'unsaved until the next keystroke, and leaving the page then said they could not be saved, ' +
    'so choosing Leave threw them away.',
  detail:
    'A save asked for while another is running now waits for it, then saves what changed since.',
} satisfies ChangelogEntry;
