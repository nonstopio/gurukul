import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-16',
  id: 'GH-123',
  title: 'Course pages wait for your progress instead of showing 0% or "Locked" first',
  area: 'LEARN',
  kind: 'fix',
  why: 'Pages drew themselves before your progress arrived, so someone halfway through a course could see 0% and "Start course", or a "Locked" note on a lesson they had already reached. If reading progress failed, the page stayed that way with no hint that anything was wrong.',
  detail: [
    'The course overview, lessons, Quizzes, results and the completion page show their loading outline until your progress is in.',
    'If your progress cannot be read (signed out elsewhere, offline), the page says it did not load and offers Retry.',
  ],
} satisfies ChangelogEntry;
