import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-30',
  id: 'STUDIO-QUESTION-BANK',
  title: 'The question bank lets you write a question, import from a Quiz, edit and delete',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'The bank could only fill up by saving a question from inside a Quiz, so an Educator who opened ' +
    'it first saw an empty list with no way to start. Writing a good question once and reusing it ' +
    'only works if you can add one where you are.',
  detail: [
    'New question: write the question, choose single or multiple choice (or true or false), mark the correct answers, add a topic and an explanation.',
    'Import from a Quiz: pick a Quiz in a course you edit and copy any of its questions, with their answers, into the bank.',
    'The bank is a table with type, topic and where each question is used. Its creator or an Admin can edit or delete it; Quizzes that already hold a copy keep it.',
  ],
} satisfies ChangelogEntry;
