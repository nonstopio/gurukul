import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-05',
  id: 'LEARNING-RULES-EXPLAINED',
  title: 'Learning rules say what they do',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'The three switches under Learning rules had only a name, so Educators had to guess what ' +
    '"go in order" locks or when a video counts as watched.',
  detail: [
    'Go in order: a chapter opens once the one before is passed (its Quizzes, or every lesson if it has none).',
    'Issue a certificate: learners who finish every lesson and pass every Quiz get one anyone can verify.',
    'Require watching videos: a lesson with a video can be marked complete only after 90% of each video is played.',
    'Each learning rule now says what happens when it is off as well as when it is on.',
  ],
} satisfies ChangelogEntry;
