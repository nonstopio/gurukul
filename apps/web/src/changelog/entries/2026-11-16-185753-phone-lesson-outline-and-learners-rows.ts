import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-16',
  id: 'GH-130',
  title: 'On a phone, a lesson opens on the lesson and the Learners list fits the screen',
  area: 'LEARN',
  kind: 'fix',
  why:
    'On a phone every lesson began with the whole chapter list, so readers scrolled past it to ' +
    'reach the content each time, and Admins had to scroll the Learners table sideways to see ' +
    'anyone’s progress or status.',
  detail: [
    'Below tablet width the chapters sit behind a closed "Chapters and lessons" button above the lesson; opening another lesson closes it again. Wider screens keep the outline beside the lesson.',
    'On a phone, Admin → Learners shows each person as a block: name first, then labelled lines for team, role, courses, progress, last active and status. Tapping a person still opens their details.',
  ],
} satisfies ChangelogEntry;
