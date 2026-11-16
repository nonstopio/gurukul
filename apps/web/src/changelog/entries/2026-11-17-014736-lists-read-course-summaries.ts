import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-17',
  id: 'GH-107',
  title: 'Home, the catalogue and search open without downloading every course',
  area: 'LEARN',
  kind: 'fix',
  why:
    'Every list of courses downloaded each course whole, every lesson and question in it, to ' +
    'show a title and a picture, and stopped without a word at 100 courses. With hundreds of ' +
    'courses on the way, Home would have taken megabytes to open.',
  detail: [
    'Home, the catalogue, Assign, the Admin overview, Learners and search now read a small summary of each course; a course is read whole only when you open it. Lists hold up to 1,000 courses and say so if they ever reach that.',
    'Search finds every course you can open, team courses included, and the lessons of the courses you are taking. A lesson in a course you have not started is found by opening the course.',
    'Recent activity names the course of a Quiz attempt ("Passed a Quiz in Git") instead of the Quiz’s own title. On a course tile, progress is counted from the number of lessons and Quizzes; the course page has the exact figure.',
  ],
} satisfies ChangelogEntry;
