import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-28',
  id: 'LESSONS-OFFLINE',
  title: 'A course you opened stays readable offline, and Mark complete never hangs',
  area: 'LEARN',
  kind: 'feature',
  why:
    'People learn on trains and patchy office Wi-Fi. Losing the connection used to stop a lesson ' +
    'mid-read and leave Mark complete spinning until the network came back.',
  detail: [
    'Lessons of a course you have opened keep loading without a connection.',
    'Mark complete moves on at once; your progress saves on this device and syncs when you are back online.',
    'A banner under the top bar says when you are offline.',
    'Quizzes still need a connection, because they are graded on the server.',
  ],
} satisfies ChangelogEntry;
