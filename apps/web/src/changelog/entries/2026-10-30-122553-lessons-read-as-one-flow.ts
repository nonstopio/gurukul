import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-30',
  id: 'LESSON-ONE-FLOW',
  title: 'A lesson reads as one centred flow, and says what is left before you move on',
  area: 'LEARN',
  kind: 'fix',
  why:
    'A video pinned beside the text split the page in two, an unrecorded video left a black box, ' +
    'and pressing Next could land you on a "Locked for now" page without saying what to finish.',
  detail: [
    'Every lesson is one centred column; a video sits in the flow where the author put it.',
    'A video that is not recorded yet is not shown at all.',
    'A lesson with a check question is complete once you have answered it and shown the answer.',
    'Pressing the button before then, or when the next item is still locked, shows a message naming what to do.',
  ],
} satisfies ChangelogEntry;
