import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'OUTLINE-GROUPED-BY-CHAPTER',
  title: 'The lesson outline is grouped by chapter and shows where you are',
  area: 'LEARN',
  kind: 'feature',
  why:
    'In a long course the flat list of every lesson buried the one you were on; now only the ' +
    'current chapter is open and each lesson shows whether it is done, up next or locked.',
  detail: [
    'Open or close any chapter in the outline; the one you are in starts open.',
    'Each lesson says "Chapter 2 · Lesson 3 of 4", with its type and minutes beside the title.',
    'Previous and Mark complete name the lessons they lead to.',
  ],
} satisfies ChangelogEntry;
