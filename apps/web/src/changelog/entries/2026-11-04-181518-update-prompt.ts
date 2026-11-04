import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-04',
  id: 'UPDATE-PROMPT',
  title: 'An open tab asks before it updates, and stops when an update is required',
  area: 'PLATFORM',
  kind: 'feature',
  why:
    'A tab left open used to reload by itself when a new version went live, sometimes in the ' +
    'middle of reading; and a tab opened before a broken version was fixed could keep running ' +
    'it, as two did for a day, repeating a write that jammed a learner’s progress.',
  detail: [
    'When a new version is live, a note offers Update or Later; nothing reloads until you choose.',
    'When an update is required, the page stops and asks you to update before you carry on. ' +
      'Progress still waiting to be saved is sent once the page has updated.',
  ],
} satisfies ChangelogEntry;
