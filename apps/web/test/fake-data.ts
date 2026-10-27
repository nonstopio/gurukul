import { vi } from 'vitest';
import type { Course } from '@gurukul/schema';
import type { AssignmentRow, LearnerData, ProgressRow } from '../src/data/types';

export const progressRow = (over: Partial<ProgressRow> = {}): ProgressRow => ({
  courseId: 'git',
  courseVersion: 1,
  lastItemId: null,
  lastActiveAt: new Date('2026-03-01T00:00:00Z'),
  completedItemIds: [],
  pariksha: {},
  percent: 0,
  completedAt: null,
  certificateId: null,
  ...over,
});

export const lesson = (id: string, over: object = {}) => ({
  type: 'lesson' as const,
  id,
  title: `Lesson ${id}`,
  minutes: 5,
  layout: 'stacked' as const,
  completeWhen: 'manual' as const,
  blocks: [{ type: 'markdown' as const, id: `${id}-b`, md: `Body of ${id}` }],
  ...over,
});

export function makeCourse(over: Partial<Course> = {}): Course {
  return {
    schemaVersion: 1,
    id: 'git',
    title: 'Git, the NonStop Way',
    summary: 'Version control for teams.',
    description: 'Learn Git.',
    level: 'foundation',
    cover: { theme: 'forest', glyph: 'G' },
    outcomes: ['Commit with confidence'],
    acharyaIds: [],
    status: 'published',
    version: 1,
    publishedAt: null,
    rules: { sequential: true, passMark: 0.7, certificate: true, requireVideoWatch: false },
    certificate: { title: 'Git', signatoryName: 'A', signatoryRole: 'K' },
    parvas: [
      { id: 'p1', title: 'Basics', items: [lesson('l1'), lesson('l2')] },
      {
        id: 'p2',
        title: 'History',
        items: [
          lesson('l3'),
          {
            type: 'pariksha',
            id: 'q1',
            title: 'Pariksha I',
            questionsShown: 1,
            shuffleOptions: false,
            cooldownMinutes: 0,
            revealAnswers: 'each',
            blocksNext: true,
            questions: [
              {
                id: 'k1',
                kind: 'single',
                prompt: 'Which?',
                options: [
                  { id: 'a', text: 'A' },
                  { id: 'b', text: 'B' },
                ],
                explanation: 'Because',
              },
            ],
          },
          lesson('l4'),
        ],
      },
    ],
    estimatedMinutes: 20,
    ...over,
  } as Course;
}

/** In-memory LearnerData. `emitProgress` pushes a document to every watcher. */
export function fakeData(
  init: {
    courses?: Course[];
    assignments?: AssignmentRow[];
    progress?: ProgressRow[];
    watched?: ProgressRow | null;
  } = {},
) {
  const courses = init.courses ?? [makeCourse()];
  const watchers: Array<(p: ProgressRow | null) => void> = [];
  const data: LearnerData = {
    listCourses: vi.fn().mockResolvedValue(courses),
    getCourse: vi.fn(async (id: string) => courses.find((c) => c.id === id) ?? null),
    myAssignments: vi.fn().mockResolvedValue(init.assignments ?? []),
    myProgress: vi.fn().mockResolvedValue(init.progress ?? []),
    watchProgress: vi.fn((_uid, _course, cb) => {
      watchers.push(cb);
      cb(init.watched === undefined ? null : init.watched);
      return () => {};
    }),
    startCourse: vi.fn().mockResolvedValue(undefined),
    completeItem: vi.fn().mockResolvedValue(undefined),
    setLastItem: vi.fn().mockResolvedValue(undefined),
  };
  return { data, emitProgress: (p: ProgressRow | null) => watchers.forEach((w) => w(p)) };
}
