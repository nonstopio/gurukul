import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-19',
  id: 'GH-171',
  title: 'Educators in the desktop app can now chat to build a course',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'Writing a course block by block is slow. Describing what you want and watching it take shape ' +
    'lets an Educator spend their time judging the course instead of typing it.',
  detail: [
    'Open a session from New course with AI or Edit with AI. Your goal waits in the message box: send it, and the agent, which runs Claude Code on your computer under your own Claude plan, changes the session’s copy of the course.',
    'The preview beside the chat draws the course as learners will see it, with every added, changed, moved or removed block marked in words. Outline shows the chapter tree with the same marks.',
    'Each finished turn says how many changes it made; Undo takes back the newest one after you confirm. Stop ends a turn and keeps what it had done.',
    'Nothing reaches the draft yet: saving a session’s changes comes with Review. The website is unchanged for anyone without the desktop app.',
  ],
} satisfies ChangelogEntry;
