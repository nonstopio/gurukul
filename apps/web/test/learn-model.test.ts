import { describe, expect, it } from 'vitest';
import type { Course } from '@gurukul/schema';
import type { AssignmentRow, ProgressRow } from '../src/data/types';
import {
  continueCourse,
  countItems,
  dueLabel,
  firstName,
  isEmbedAllowed,
  orderAssigned,
  percentFor,
  videoEmbedUrl,
} from '../src/learn/model';

const course = (id: string, title = id): Course =>
  ({
    id,
    title,
    parvas: [
      {
        id: 'p',
        title: 'P',
        items: [
          { type: 'lesson', id: `${id}-l1` },
          { type: 'lesson', id: `${id}-l2` },
          { type: 'pariksha', id: `${id}-q1` },
        ],
      },
    ],
  }) as unknown as Course;
const assignment = (over: Partial<AssignmentRow> = {}): AssignmentRow => ({
  id: 'a',
  courseId: 'x',
  dueAt: null,
  mandatory: false,
  status: 'assigned',
  ...over,
});
const progress = (over: Partial<ProgressRow> = {}): ProgressRow => ({
  courseId: 'x',
  courseVersion: 1,
  lastItemId: null,
  lastActiveAt: null,
  completedItemIds: [],
  pariksha: {},
  percent: 0,
  completedAt: null,
  certificateId: null,
  ...over,
});

describe('percentFor and countItems', () => {
  it('uses the shared helper, and 0 before a course is started', () => {
    expect(percentFor(course('x'), null)).toBe(0);
    expect(percentFor(course('x'), progress({ completedItemIds: ['x-l1'] }))).toBe(33);
    expect(countItems(course('x'))).toEqual({ lessons: 2, parikshas: 1 });
  });
});

describe('orderAssigned', () => {
  const row = (title: string, a: Partial<AssignmentRow>, p: ProgressRow | null = null) => ({
    assignment: assignment(a),
    course: course(title),
    progress: p,
  });
  it('puts unfinished first, then mandatory, then earliest due, then title', () => {
    const rows = [
      row('done', { status: 'completed' }),
      row('finished-by-progress', {}, progress({ completedAt: new Date(1) })),
      row('optional-soon', { dueAt: new Date('2026-01-01') }),
      row('b-none', {}),
      row('a-none', {}),
      row('mandatory-late', { mandatory: true, dueAt: new Date('2026-06-01') }),
      row('mandatory-soon', { mandatory: true, dueAt: new Date('2026-02-01') }),
    ];
    expect(orderAssigned(rows).map((r) => r.course.title)).toEqual([
      'mandatory-soon',
      'mandatory-late',
      'optional-soon',
      'a-none',
      'b-none',
      'done',
      'finished-by-progress',
    ]);
  });
});

describe('continueCourse', () => {
  const courses = [course('git'), course('sql')];
  it('picks the most recently active unfinished course that still exists', () => {
    const ps = [
      progress({ courseId: 'gone', lastActiveAt: new Date(9) }),
      progress({ courseId: 'git', lastActiveAt: new Date(2) }),
      progress({ courseId: 'sql', lastActiveAt: new Date(5) }),
      progress({ courseId: 'git', lastActiveAt: null }),
      progress({ courseId: 'sql', lastActiveAt: null }),
      progress({ courseId: 'git', lastActiveAt: null }),
      progress({ courseId: 'sql', completedAt: new Date(1), lastActiveAt: new Date(99) }),
    ];
    expect(continueCourse(courses, ps)?.course.id).toBe('sql');
  });
  it('is null with nothing in progress', () => {
    expect(continueCourse(courses, [])).toBeNull();
    expect(continueCourse(courses, [progress({ courseId: 'gone' })])).toBeNull();
  });
});

describe('dueLabel and firstName', () => {
  const now = new Date('2026-03-10T12:00:00Z');
  it('counts whole days, with plurals', () => {
    expect(dueLabel(new Date('2026-03-13T12:00:00Z'), now)).toEqual({
      text: 'Due in 3 days',
      overdue: false,
    });
    expect(dueLabel(new Date('2026-03-11T12:00:00Z'), now).text).toBe('Due in 1 day');
    expect(dueLabel(now, now).text).toBe('Due today');
    expect(dueLabel(new Date('2026-03-09T12:00:00Z'), now)).toEqual({
      text: 'Overdue by 1 day',
      overdue: true,
    });
    expect(dueLabel(new Date('2026-03-07T12:00:00Z'), now).text).toBe('Overdue by 3 days');
  });
  it('takes the first word of the name, or nothing', () => {
    expect(firstName(' Priya  Kulkarni')).toBe('Priya');
    expect(firstName('')).toBe('');
    expect(firstName(null)).toBe('');
    expect(firstName(undefined)).toBe('');
  });
});

describe('embeds', () => {
  it('allows only listed https hosts', () => {
    expect(isEmbedAllowed('https://www.loom.com/embed/abc')).toBe(true);
    expect(isEmbedAllowed('https://stackblitz.com/edit/x')).toBe(true);
    expect(isEmbedAllowed('http://www.loom.com/embed/abc')).toBe(false);
    expect(isEmbedAllowed('https://evil.example/x')).toBe(false);
    expect(isEmbedAllowed('not a url')).toBe(false);
  });

  it.each([
    [
      'youtube',
      'https://www.youtube.com/watch?v=abc123',
      'https://www.youtube-nocookie.com/embed/abc123',
    ],
    ['youtube', 'https://youtu.be/abc123', 'https://www.youtube-nocookie.com/embed/abc123'],
    [
      'youtube',
      'https://www.youtube.com/embed/abc123',
      'https://www.youtube-nocookie.com/embed/abc123',
    ],
    ['loom', 'https://www.loom.com/share/abc123', 'https://www.loom.com/embed/abc123'],
    ['loom', 'https://www.loom.com/embed/abc123', 'https://www.loom.com/embed/abc123'],
    [
      'drive',
      'https://drive.google.com/file/d/abc123/view',
      'https://drive.google.com/file/d/abc123/preview',
    ],
  ] as const)('turns a %s link into an embed URL', (provider, url, out) => {
    expect(videoEmbedUrl(provider, url)).toBe(out);
  });

  it.each([
    ['youtube', 'nonsense'],
    ['youtube', 'http://www.youtube.com/watch?v=abc123'],
    ['youtube', 'https://www.youtube.com/watch'],
    ['youtube', 'https://www.youtube.com/watch?v=a'],
    ['youtube', 'https://evil.example/watch?v=abc123'],
    ['loom', 'https://www.loom.com/other/abc'],
    ['loom', 'https://evil.example/share/abc'],
    ['drive', 'https://drive.google.com/open?id=abc'],
    ['drive', 'https://evil.example/file/d/abc/view'],
  ] as const)('refuses %s link %s', (provider, url) => {
    expect(videoEmbedUrl(provider, url)).toBeNull();
  });
});
