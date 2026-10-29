import { describe, expect, it } from 'vitest';
import {
  attemptSchema,
  isItemDone,
  isChapterPassed,
  itemStates,
  itemsOf,
  progressId,
  progressPercent,
  resumeItemId,
  type ProgressState,
} from '../src';
import { itemAt, makeCourse, chapterAt, ts } from './fixtures';

const none: ProgressState = { completedItemIds: [], quiz: {} };
const passed = { best: 1, passed: true, attempts: 1, lastAttemptAt: ts(1) };
const failed = { best: 0.2, passed: false, attempts: 1, lastAttemptAt: ts(1) };

describe('progress helpers', () => {
  const course = makeCourse();

  it('names a progress document uid_courseId', () => {
    expect(progressId('u1', 'git')).toBe('u1_git');
  });

  it('lists items in reading order', () => {
    expect(itemsOf(course).map((i) => i.id)).toEqual(['l1', 'q1', 'l2', 'l3']);
  });

  it('counts lessons by completion and Quizzes by passing', () => {
    expect(isItemDone(itemAt(course, 0), { ...none, completedItemIds: ['l1'] })).toBe(true);
    expect(isItemDone(itemAt(course, 1), { ...none, quiz: { q1: passed } })).toBe(true);
    expect(isItemDone(itemAt(course, 1), { ...none, quiz: { q1: failed } })).toBe(false);
    expect(isItemDone(itemAt(course, 1), none)).toBe(false);
  });

  it('computes the percent and ignores ids that no longer exist', () => {
    expect(progressPercent(course, none)).toBe(0);
    expect(
      progressPercent(course, { completedItemIds: ['l1', 'gone'], quiz: { q1: passed } }),
    ).toBe(50);
    expect(
      progressPercent(course, { completedItemIds: ['l1', 'l2', 'l3'], quiz: { q1: passed } }),
    ).toBe(100);
  });

  it('is 0 for a course with no items', () => {
    expect(progressPercent({ chapters: [] }, none)).toBe(0);
  });
});

describe('itemStates', () => {
  const course = makeCourse();
  const twoChapters = (sequential: boolean, blocksNext = true) => {
    const c = makeCourse({
      rules: { sequential, passMark: 0.7, certificate: true, requireVideoWatch: false },
    });
    const p = itemAt(c, 1);
    if (p.type === 'quiz') p.blocksNext = blocksNext;
    const [first] = c.chapters;
    c.chapters.push({
      id: 'p2',
      title: 'Next',
      items: [{ ...itemAt(c, 0), id: 'n1' }],
    });
    return { c, first };
  };

  it('marks the first unfinished item current and locks what a blocking Quiz guards', () => {
    expect(itemStates(course, none)).toEqual({
      l1: 'current',
      q1: 'todo',
      l2: 'locked',
      l3: 'locked',
    });
    expect(itemStates(course, { ...none, completedItemIds: ['l1'] })).toEqual({
      l1: 'done',
      q1: 'current',
      l2: 'locked',
      l3: 'locked',
    });
  });

  it('unlocks after the Quiz is passed', () => {
    expect(itemStates(course, { completedItemIds: ['l1'], quiz: { q1: passed } })).toEqual({
      l1: 'done',
      q1: 'done',
      l2: 'current',
      l3: 'todo',
    });
  });

  it('does not lock behind a Quiz that does not block', () => {
    const { c } = twoChapters(false, false);
    expect(itemStates(c, { ...none, completedItemIds: ['l1'] }).l2).toBe('todo');
  });

  it('locks the next chapter until the previous chapter’s Quiz is passed, only when sequential', () => {
    const seq = twoChapters(true).c;
    expect(itemStates(seq, none).n1).toBe('locked');
    expect(itemStates(seq, { ...none, completedItemIds: ['l1', 'l2', 'l3'] }).n1).toBe('locked');
    expect(itemStates(seq, { completedItemIds: ['l1'], quiz: { q1: passed } }).n1).toBe('todo');
    expect(itemStates(twoChapters(false).c, none).n1).toBe('todo');
  });

  it('locks the next chapter of a chapter without a Quiz until all its lessons are done', () => {
    const { c } = twoChapters(true);
    const first = chapterAt(c, 0);
    first.items = first.items.filter((i) => i.type === 'lesson');
    expect(itemStates(c, { ...none, completedItemIds: ['l1', 'l2'] }).n1).toBe('locked');
    expect(itemStates(c, { ...none, completedItemIds: ['l1', 'l2', 'l3'] }).n1).toBe('current');
  });

  it('keeps a finished item done even inside a locked chapter', () => {
    const seq = twoChapters(true).c;
    expect(itemStates(seq, { ...none, completedItemIds: ['n1'] }).n1).toBe('done');
  });
});

describe('isChapterPassed', () => {
  const chapter = chapterAt(makeCourse(), 0);
  it('needs every Quiz passed when the chapter has one', () => {
    expect(isChapterPassed(chapter, { ...none, completedItemIds: ['l1', 'l2', 'l3'] })).toBe(false);
    expect(isChapterPassed(chapter, { completedItemIds: [], quiz: { q1: passed } })).toBe(true);
    expect(
      isChapterPassed(chapter, { completedItemIds: [], quiz: { q1: { passed: false } } }),
    ).toBe(false);
  });

  it('needs every lesson done when the chapter has no Quiz, and nothing when empty', () => {
    const lessons = { items: chapter.items.filter((i) => i.type === 'lesson') };
    expect(isChapterPassed(lessons, { ...none, completedItemIds: ['l1', 'l2'] })).toBe(false);
    expect(isChapterPassed(lessons, { ...none, completedItemIds: ['l1', 'l2', 'l3'] })).toBe(true);
    expect(isChapterPassed({ items: [] }, none)).toBe(true);
  });
});

describe('resumeItemId', () => {
  const course = makeCourse();
  it('opens the saved item when it still exists', () => {
    expect(resumeItemId(course, { ...none, lastItemId: 'l3' })).toBe('l3');
  });
  it('falls back to the first unfinished item when it was deleted or never set', () => {
    expect(resumeItemId(course, { ...none, lastItemId: 'gone' })).toBe('l1');
    expect(resumeItemId(course, { ...none, lastItemId: null, completedItemIds: ['l1'] })).toBe(
      'q1',
    );
  });
  it('falls back to the first item when everything is done, and to null for an empty course', () => {
    const all = {
      completedItemIds: ['l1', 'l2', 'l3'],
      quiz: { q1: passed },
      lastItemId: null,
    };
    expect(resumeItemId(course, all)).toBe('l1');
    expect(
      resumeItemId({ chapters: [], rules: course.rules }, { ...none, lastItemId: null }),
    ).toBeNull();
  });
});

describe('attemptSchema', () => {
  const base = { uid: 'u', courseId: 'git', quizId: 'pk', score: 0.5 };

  it('defaults results for attempts recorded before they were stored', () => {
    expect(attemptSchema.parse(base).results).toEqual([]);
    expect(attemptSchema.parse(base).passed).toBe(false);
    expect(attemptSchema.parse({ ...base, passed: true }).passed).toBe(true);
    const results = [{ questionId: 'q1', correct: true }];
    expect(attemptSchema.parse({ ...base, results, extra: 1 }).results).toEqual(results);
  });

  it('rejects a score outside 0..1', () => {
    expect(attemptSchema.safeParse({ ...base, score: 2 }).success).toBe(false);
  });
});
