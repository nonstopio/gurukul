import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-20',
  id: 'AI-SESSIONS-ANSWERS',
  title: 'Review checks each new Quiz answer with a second opinion',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'An agent that writes a question can mark the wrong option as right, and the slip reads ' +
    'just like the rest of the Quiz. A separate run that answers the question without seeing ' +
    'the key catches the ones worth a second look before learners are graded on them.',
  detail: [
    'In the desktop app, Review answers every Quiz question the session added or changed again, from the lessons around it and without the answer key, two at a time, and compares that answer with the key.',
    'A disagreement shows Check this answer on the Quiz and in the Answers check, with what the second opinion chose and why. Ask the agent to fix these sends them to the chat.',
    'Each question is checked once, and again only when it or its lessons change. It uses your own Claude plan, so Skip answer check turns it off for the session. Nothing it finds stops Save.',
  ],
} satisfies ChangelogEntry;
