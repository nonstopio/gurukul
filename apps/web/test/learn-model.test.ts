import { describe, expect, it } from 'vitest';
import type { Course } from '@gurukul/schema';
import type { AssignmentRow, ProgressRow } from '../src/data/types';
import { terms } from '../src/labels/terms';
import {
  agoLabel,
  recentActivity,
  statusLine,
  upNext,
  continueCourse,
  countItems,
  courseImageUrl,
  dueLabel,
  firstName,
  hasNewLessons,
  isRetired,
  orderAssigned,
  nextAssigned,
  durationLabel,
  percentFor,
} from '../src/learn/model';

const course = (id: string, title = id): Course =>
  ({
    id,
    title,
    chapters: [
      {
        id: 'p',
        title: 'P',
        items: [
          { type: 'lesson', id: `${id}-l1` },
          { type: 'lesson', id: `${id}-l2` },
          { type: 'quiz', id: `${id}-q1` },
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
  assignedByName: null,
  ...over,
});
const progress = (over: Partial<ProgressRow> = {}): ProgressRow => ({
  courseId: 'x',
  courseVersion: 1,
  lastItemId: null,
  lastActiveAt: null,
  completedItemIds: [],
  quiz: {},
  percent: 0,
  completedAt: null,
  certificateId: null,
  ...over,
});

describe('percentFor and countItems', () => {
  it('uses the shared helper, and 0 before a course is started', () => {
    expect(percentFor(course('x'), null)).toBe(0);
    expect(percentFor(course('x'), progress({ completedItemIds: ['x-l1'] }))).toBe(33);
    expect(countItems(course('x'))).toEqual({ lessons: 2, quizzes: 1 });
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

describe('nextAssigned and durationLabel', () => {
  const row = (id: string, a: Partial<AssignmentRow>, p: ProgressRow | null = null) => ({
    assignment: assignment(a),
    course: course(id),
    progress: p,
  });
  it('skips the current course and finished ones, and is null when nothing is left', () => {
    const rows = [
      row('cur', {}),
      row('done', { status: 'completed' }),
      row('also-done', {}, progress({ completedAt: new Date(1) })),
      row('next', {}),
    ];
    expect(nextAssigned(rows, 'cur')?.course.id).toBe('next');
    expect(nextAssigned(rows.slice(0, 3), 'cur')).toBeNull();
  });
  it('formats minutes', () => {
    expect(durationLabel(45)).toBe('45 min');
    expect(durationLabel(120)).toBe('2 h');
    expect(durationLabel(80)).toBe('1 h 20 min');
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

describe('isRetired and hasNewLessons', () => {
  it('calls only an archived course retired', () => {
    expect(isRetired({ status: 'archived' })).toBe(true);
    expect(isRetired({ status: 'published' })).toBe(false);
  });
  it('flags a finished course that has since gained items, and nothing else', () => {
    const c = course('git');
    const done = (completedItemIds: string[], completedAt: Date | null) =>
      ({
        completedItemIds,
        quiz: { 'git-q1': { passed: true } },
        completedAt,
      }) as unknown as ProgressRow;
    const at = new Date('2026-03-01T00:00:00Z');
    expect(hasNewLessons(c, done(['git-l1'], at))).toBe(true);
    expect(hasNewLessons(c, done(['git-l1', 'git-l2'], at))).toBe(false);
    expect(hasNewLessons(c, done(['git-l1'], null))).toBe(false);
    expect(hasNewLessons(c, null)).toBe(false);
  });
});

describe('Home status, up next and recent activity', () => {
  const c = {
    id: 'git',
    title: 'Git',
    rules: { sequential: false },
    chapters: [
      {
        id: 'p1',
        title: 'Basics',
        items: [
          { type: 'lesson', id: 'l1', title: 'Init' },
          { type: 'lesson', id: 'l2', title: 'Commit' },
          { type: 'quiz', id: 'q1', title: 'Check' },
        ],
      },
    ],
  } as unknown as Course;
  const p = (over: Partial<ProgressRow> = {}): ProgressRow => ({
    courseId: 'git',
    courseVersion: 1,
    lastItemId: null,
    lastActiveAt: new Date('2026-01-05'),
    completedItemIds: [],
    quiz: {},
    percent: 0,
    completedAt: null,
    certificateId: null,
    ...over,
  });

  it('names the percent and what is left in the chapter', () => {
    expect(statusLine(c, p({ completedItemIds: ['l1'] }), terms('generic'))).toBe(
      'You are 33% through Git. 2 items left to finish the Basics chapter.',
    );
    expect(statusLine(c, p({ completedItemIds: ['l1', 'l2'] }), terms('generic'))).toContain(
      'One item left',
    );
  });

  it('drops the chapter sentence when nothing is left or nothing exists', () => {
    const done = p({ completedItemIds: ['l1', 'l2'], quiz: { q1: { passed: true } as never } });
    expect(statusLine(c, done, terms('generic'))).toBe('You are 100% through Git.');
    expect(statusLine({ ...c, chapters: [] } as Course, p(), terms('generic'))).toBe(
      'You are 0% through Git.',
    );
    expect(upNext({ ...c, chapters: [] } as Course, p())).toBeNull();
    expect(upNext(c, p({ lastItemId: 'l2' }))?.item.title).toBe('Commit');
  });

  it('merges certificates, completions, Quiz attempts and activity, newest first', () => {
    const events = recentActivity(
      [c, { ...c, id: 'sql', title: 'SQL' } as Course],
      [
        p({
          quiz: {
            q1: { best: 1, passed: true, attempts: 1, lastAttemptAt: new Date('2026-01-07') },
            gone: { best: 0, passed: false, attempts: 1, lastAttemptAt: new Date('2026-01-08') },
            q2: { best: 0, passed: false, attempts: 0, lastAttemptAt: null },
          },
        }),
        p({ courseId: 'sql', completedAt: new Date('2026-01-09') }),
        p({ courseId: 'missing' }),
      ],
      [{ id: 'c1', courseTitle: 'SQL', issuedAt: new Date('2026-01-10') } as never],
    );
    expect(events.map((e) => e.text)).toEqual([
      'Certificate issued for SQL',
      'Finished SQL',
      'Passed Check',
      'Worked on Git',
    ]);
    expect(recentActivity([c], [p()], [], 0)).toEqual([]);
  });

  it('finds the chapter of an item in a later chapter, and words failed and untimed events', () => {
    const two = {
      ...c,
      chapters: [
        ...c.chapters,
        { id: 'p2', title: 'More', items: [{ type: 'lesson', id: 'l9', title: 'Rebase' }] },
      ],
    } as unknown as Course;
    expect(upNext(two, p({ lastItemId: 'l9' }))?.chapter.title).toBe('More');
    const events = recentActivity(
      [c],
      [
        p({
          lastActiveAt: null,
          quiz: { q1: { best: 0, passed: false, attempts: 1, lastAttemptAt: new Date() } },
        }),
      ],
      [],
    );
    expect(events.map((e) => e.text)).toEqual(['Attempted Check']);
  });

  it('says how long ago', () => {
    const now = new Date('2026-01-10T12:00:00Z');
    expect(agoLabel(new Date('2026-01-10T01:00:00Z'), now)).toBe('Today');
    expect(agoLabel(new Date('2026-01-09T01:00:00Z'), now)).toBe('1 day ago');
    expect(agoLabel(new Date('2026-01-07T01:00:00Z'), now)).toBe('3 days ago');
  });
});

describe('courseImageUrl', () => {
  const lesson = (blocks: unknown[]) => ({ type: 'lesson', id: 'l', blocks });
  const withItems = (...items: unknown[]) =>
    ({ chapters: [{ id: 'c', title: 'C', items }] }) as unknown as Course;
  it('is the first image in reading order', () => {
    const c = withItems(
      lesson([{ type: 'text', id: 't' }]),
      lesson([
        { type: 'text', id: 't2' },
        { type: 'image', id: 'i1', url: 'https://example.com/1.png' },
        { type: 'image', id: 'i2', url: 'https://example.com/2.png' },
      ]),
    );
    expect(courseImageUrl(c)).toBe('https://example.com/1.png');
  });
  it('skips quizzes and is undefined when the course has no picture', () => {
    expect(courseImageUrl(withItems({ type: 'quiz', id: 'q' }, lesson([])))).toBeUndefined();
    expect(courseImageUrl({ chapters: [] })).toBeUndefined();
  });
});
