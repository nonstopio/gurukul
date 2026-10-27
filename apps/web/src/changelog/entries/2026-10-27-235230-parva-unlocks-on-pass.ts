import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-27',
  id: 'PARVA-UNLOCKS-ON-PASS',
  title: 'Passing a parva’s Pariksha opens the next parva',
  area: 'PARIKSHA',
  kind: 'fix',
  why:
    'The Pariksha is the proof you understood the parva, so passing it should be what moves you ' +
    'on. Before, a sequential course also waited for every lesson to be ticked, and a locked ' +
    'Pariksha could still be graded by calling the server directly.',
  detail: [
    'In a sequential course the next parva opens as soon as every Pariksha in the one before is passed; a parva with no Pariksha still opens it once all its lessons are done.',
    'The server now refuses to check answers or grade a Pariksha that is still locked for you, so the lock holds outside the app too.',
  ],
} satisfies ChangelogEntry;
