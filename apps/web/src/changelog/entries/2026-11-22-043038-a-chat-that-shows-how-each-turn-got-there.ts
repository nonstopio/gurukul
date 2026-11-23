import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-22',
  id: 'AI-CHAT-TURNS',
  title: 'The Edit with AI chat shows how each turn got there',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'After a turn you had to open Review to learn what the agent had actually touched. Now the chat ' +
    'answers that where you are reading: the reply first, the parts it changed under it, and how ' +
    'long it worked, so you can judge a turn without leaving the conversation.',
  detail: [
    'Each reply has a folded "How it got there" with the steps the agent took.',
    'Under it, a row for each lesson, Quiz, chapter or course detail the turn changed, six shown and "+N more" for the rest.',
    'A footer says "Worked for 2m 39s, 19 changes", links to Review, and copies the reply.',
    '"Go back to before this" replaces "Undo turn N" and still asks first; the newest turn also says whether the checks pass.',
    'The message box is one rounded box with a plus for attaching and a round Send that becomes Stop.',
  ],
} satisfies ChangelogEntry;
