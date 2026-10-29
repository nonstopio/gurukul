import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-27',
  id: 'GURUKUL-STUDIO',
  title: 'Educators can build and publish courses in Studio',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'A new course should not need an engineer. Drafts save as you type, publishing checks the ' +
    'course first and shows what learners will see change, and every publish is kept so a mistake ' +
    'can be rolled back without losing anyone’s progress.',
  detail: [
    'Open /studio to create a course, add chapters and lessons, and edit every kind of content block.',
    'The Quiz builder keeps answer keys on the server side; the question bank reuses questions.',
    'Preview a draft as a learner, publish with a list of added, edited and removed items, and roll back from Versions.',
  ],
} satisfies ChangelogEntry;
