import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-17',
  id: 'GH-165',
  title: 'New questions, answers, chapters and lessons start empty',
  area: 'STUDIO',
  kind: 'fix',
  why:
    'A new Quiz question arrived filled with "New question", "Answer 1" and "Answer 2", and a new ' +
    'chapter, lesson or Quiz with a made-up name. You had to delete that text before typing your ' +
    'own, every time.',
  detail: [
    'The fields now start empty and show a grey hint ("Type the question", "Type an answer", "Untitled lesson") that disappears as you type.',
    'Lists still name an empty item, "New question" or "Untitled chapter", so you can find it. Publish still asks for every title, question and answer to be filled in.',
  ],
} satisfies ChangelogEntry;
