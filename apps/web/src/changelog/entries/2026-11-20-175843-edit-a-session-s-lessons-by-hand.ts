import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-20',
  id: 'AI-SESSIONS-HAND-EDITS',
  title: 'In a Gurukul Studio session, any lesson or Quiz opens in the usual editor',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'Some fixes are quicker to type than to ask for. Editing by hand inside the session keeps ' +
    'them in the same copy as the agent’s work, so they are reviewed, undone and saved to the ' +
    'draft together with it, and nothing reaches the draft before you save.',
  detail: [
    'Open in editor on the preview and on each Outline row opens Studio’s lesson editor or Quiz builder on the session’s copy.',
    'Leaving the editor makes your edits one turn in the chat, marked "by hand", which Undo takes back like any other.',
    'While the agent is working, the editor waits for its turn to end, and offers Stop.',
    'Edits that leave a title or a question empty are kept only once complete. Uploads work as in Studio, except in a new course before its first save.',
  ],
} satisfies ChangelogEntry;
