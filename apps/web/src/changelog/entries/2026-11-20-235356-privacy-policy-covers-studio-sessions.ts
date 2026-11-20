import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-20',
  id: 'AI-SESSIONS-PRIVACY',
  title:
    'The privacy policy says what a Gurukul Studio session sends, and a guide shows the way in',
  area: 'PLATFORM',
  kind: 'docs',
  why:
    'A session in the desktop app sends course text to Anthropic under your own Claude account, ' +
    'and nothing said exactly what goes, what stays on your computer and what Gurukul keeps. ' +
    'Knowing that before you start is what lets you decide what to put in a session.',
  detail: [
    'The privacy policy has a new part, Gurukul Studio sessions: what goes to Anthropic (the course parts the session works on, your messages and the Sources files the agent reads; never learner data, and never the answer key to the second opinion), what stays on your computer and for how long, and that Gurukul stores only the draft you save. Because the policy changed, everyone is asked to accept it once more.',
    'Gurukul now counts sessions started and saved, with only whether the course was new and the number of changes and turns in bands such as 6-20: never a course, a title or anything written.',
    'A new guide, Gurukul Studio: build a course by chatting, walks you through installing the app on a Mac or Windows, installing Claude Code and signing in to it in a terminal, a first session from start to publish, the Sources folder, plan limits, where session files live and what to do when the agent cannot run.',
  ],
} satisfies ChangelogEntry;
