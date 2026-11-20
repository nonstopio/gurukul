import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-21',
  id: 'AI-SESSIONS-POLISH',
  title: 'Sessions say why they wait, and find a new course the app closed on',
  area: 'STUDIO',
  kind: 'fix',
  why: 'A session told you to wait for the agent when the agent was not the reason, called bringing in someone’s draft an edit by hand, and lost track of a new course when the app closed just after creating it, so its own address then read as taken. Each now says what is really going on, and the course is found again.',
  detail: [
    'When the draft moved, Bring in their changes names what it waits for: the agent starting, your hand edits, or a change being written.',
    'Bringing in a draft shows in the chat as “draft brought in”, not “by hand”.',
    'A new course created just before the app closed is recognised as yours at the address you chose, and the session carries on as an edit of it. A course that is not yours there still says the address is taken.',
    'The Answers check says when it waits because the app’s two answer checks are busy elsewhere.',
    'A main button that cannot be pressed yet now looks it in the dark theme too.',
    'In the browser, the desktop app card gives up on GitHub after a few seconds and links to the releases page, and its tip no longer covers the other installers.',
  ],
} satisfies ChangelogEntry;
