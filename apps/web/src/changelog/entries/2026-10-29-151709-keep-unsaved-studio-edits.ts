import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'KEEP-UNSAVED-EDITS',
  title: 'Studio keeps edits that could not be saved',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'A dropped connection or a closed tab used to lose whatever an Educator had typed since the ' +
    'last successful save, and clicking away inside Studio did it without a word.',
  detail: [
    'When a save fails, the edits are also kept on this device and offered back the next time you open the course.',
    'Leaving an editor with edits that could not be saved now asks first; edits that are only waiting for autosave are saved and you move on.',
  ],
} satisfies ChangelogEntry;
