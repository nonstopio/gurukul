import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-30',
  id: 'ASSIGN-FOUR-STEPS',
  title: 'Assigning a course is four short steps, and you see it all before it happens',
  area: 'ADMIN',
  kind: 'feature',
  why:
    'One long page asked for everything at once and gave no moment to check it. Taking it a ' +
    'step at a time, ending in a plain sentence, makes a wrong assignment easy to catch before ' +
    'anyone is emailed.',
  detail: [
    'Course, Audience, Schedule, Review: Back and Next move between them and nothing is assigned until the last button.',
    'Pick an existing team, search for people, or make a new team on the spot from the emails you add.',
    'Each step tells you in words what is missing before it lets you on.',
    'When it is done you get a clear confirmation with a link to the learners you just assigned.',
  ],
} satisfies ChangelogEntry;
