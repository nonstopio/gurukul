import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-20',
  id: 'AI-SESSIONS-CHAT-POLISH',
  title: 'Links in a Gurukul Studio session’s chat show their address instead of opening',
  area: 'STUDIO',
  kind: 'security',
  why:
    'What the agent writes can come from a file or page it read, so a link in its reply could say ' +
    '“the Git book” while pointing somewhere else, and one click opened that address in your ' +
    'browser. Now you see where every link points before you decide to go there.',
  detail: [
    'A link in the agent’s reply reads as its words and its address in brackets; copy the address if you want to open it.',
    'Your message stays in the chat if the page reloads while the agent is still answering it, and that turn keeps your words as its line.',
    'A long session title no longer pushes the top of the chat under the top bar.',
    'A long chat in Hindi, Chinese or another script no longer stops being saved once it grows large.',
  ],
} satisfies ChangelogEntry;
