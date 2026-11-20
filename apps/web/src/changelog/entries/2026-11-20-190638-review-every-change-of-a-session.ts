import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-20',
  id: 'AI-SESSIONS-REVIEW',
  title: 'Read every change the agent made on one screen',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'Forty minutes of chat can touch a dozen lessons, and nothing should reach the draft that ' +
    'you have not read. Review lists each change against the draft the session started from, ' +
    'with the old and new words side by side, so you check it all at once instead of trusting ' +
    'the agent turn by turn.',
  detail: [
    'In the desktop app, a session’s Review tab lists what was added, changed, removed, moved or renamed, in course order, and shows the selected change side by side, inline, or as a learner sees it before and after.',
    'Changed words are struck through or underlined, code is compared line by line, and a changed correct answer gets its own warning line. Unchanged blocks are folded away.',
    'Tick changes as viewed, ask the agent for a change to one of them, or put one back as it is in the draft. The checks say whether the course is valid, its size, what the writing check found and what is left for you.',
  ],
} satisfies ChangelogEntry;
