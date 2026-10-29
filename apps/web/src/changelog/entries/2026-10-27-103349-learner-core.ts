import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-27',
  id: 'M2-LEARNER-CORE',
  title: 'Browse courses, open a lesson and pick up where you left off',
  area: 'LEARN',
  kind: 'feature',
  why:
    'Learning is the point of Gurukul. You can now see what is assigned to you, browse every ' +
    'published course, work through lessons, and come back later on any device to the lesson you ' +
    'were on.',
  detail: [
    'Home shows a continue card, your assigned courses ordered by mandatory and due date, or the catalogue when nothing is assigned.',
    'Each course has an outline with Done, Up next and Locked states; in a sequential course the next chapter opens when the previous one is finished.',
    'Lessons render video, notes, code with a copy button, callouts, images and ungraded check questions. J and K move between lessons.',
    'Your progress is saved as a set, so finishing lessons in two tabs never loses either one.',
    'The first course, Git, the NonStop Way, is written and can be loaded with npm run seed. Its videos and NonStop-specific conventions are marked as placeholders to replace.',
    'Quizzes are listed in the outline but open in the next release.',
  ],
} satisfies ChangelogEntry;
