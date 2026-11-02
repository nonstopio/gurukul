import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-02',
  id: 'SHORT-BUTTONS',
  title: 'Buttons say what they do, and the lesson’s main button sits on the right',
  area: 'LEARN',
  kind: 'feature',
  why:
    'Buttons carried the name of the next lesson or course ("Mark complete · Install and ' +
    'configure Git"), so they grew long, wrapped on a phone and read like a sentence. The page ' +
    'and the outline already show what comes next; the button only needs the action.',
  detail: [
    'The lesson footer says Mark complete, Next, Finish course or Back to the course, and Previous, and the forward button is always on the right.',
    'The course page says Resume, a passed Quiz says Continue, and the next course in your queue says Start or Continue.',
    'Each missed question in a Quiz review links with Revisit lesson; screen readers still hear which lesson.',
  ],
} satisfies ChangelogEntry;
