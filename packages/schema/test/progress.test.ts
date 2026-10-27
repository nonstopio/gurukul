import { describe, expect, it } from 'vitest';
import {
  isItemDone,
  itemStates,
  itemsOf,
  progressId,
  progressPercent,
  resumeItemId,
  type ProgressState,
} from '../src';
import { itemAt, makeCourse, ts } from './fixtures';

const none: ProgressState = { completedItemIds: [], pariksha: {} };
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

  it('counts lessons by completion and Parikshas by passing', () => {
    expect(isItemDone(itemAt(course, 0), { ...none, completedItemIds: ['l1'] })).toBe(true);
    expect(isItemDone(itemAt(course, 1), { ...none, pariksha: { q1: passed } })).toBe(true);
    expect(isItemDone(itemAt(course, 1), { ...none, pariksha: { q1: failed } })).toBe(false);
    expect(isItemDone(itemAt(course, 1), none)).toBe(false);
  });

  it('computes the percent and ignores ids that no longer exist', () => {
    expect(progressPercent(course, none)).toBe(0);
    expect(
      progressPercent(course, { completedItemIds: ['l1', 'gone'], pariksha: { q1: passed } }),
    ).toBe(50);
    expect(
      progressPercent(course, { completedItemIds: ['l1', 'l2', 'l3'], pariksha: { q1: passed } }),
    ).toBe(100);
  });

  it('is 0 for a course with no items', () => {
    expect(progressPercent({ parvas: [] }, none)).toBe(0);
  });
});

describe('itemStates', () => {
  const course = makeCourse();
  const twoParvas = (sequential: boolean, blocksNext = true) => {
    const c = makeCourse({
      rules: { sequential, passMark: 0.7, certificate: true, requireVideoWatch: false },
    });
    const p = itemAt(c, 1);
    if (p.type === 'pariksha') p.blocksNext = blocksNext;
    const [first] = c.parvas;
    c.parvas.push({
      id: 'p2',
      title: 'Next',
      items: [{ ...itemAt(c, 0), id: 'n1' }],
    });
    return { c, first };
  };

  it('marks the first unfinished item current and locks what a blocking Pariksha guards', () => {
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

  it('unlocks after the Pariksha is passed', () => {
    expect(itemStates(course, { completedItemIds: ['l1'], pariksha: { q1: passed } })).toEqual({
      l1: 'done',
      q1: 'done',
      l2: 'current',
      l3: 'todo',
    });
  });

  it('does not lock behind a Pariksha that does not block', () => {
    const { c } = twoParvas(false, false);
    expect(itemStates(c, { ...none, completedItemIds: ['l1'] }).l2).toBe('todo');
  });

  it('locks the next parva until the previous one is finished, only when sequential', () => {
    const all = { completedItemIds: ['l1', 'l2'], pariksha: { q1: passed } };
    const seq = twoParvas(true).c;
    expect(itemStates(seq, none).n1).toBe('locked');
    expect(itemStates(seq, all).n1).toBe('locked');
    expect(itemStates(seq, { ...all, completedItemIds: ['l1', 'l2', 'l3'] }).n1).toBe('current');
    expect(itemStates(twoParvas(false).c, none).n1).toBe('todo');
  });

  it('keeps a finished item done even inside a locked parva', () => {
    const seq = twoParvas(true).c;
    expect(itemStates(seq, { ...none, completedItemIds: ['n1'] }).n1).toBe('done');
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
      pariksha: { q1: passed },
      lastItemId: null,
    };
    expect(resumeItemId(course, all)).toBe('l1');
    expect(
      resumeItemId({ parvas: [], rules: course.rules }, { ...none, lastItemId: null }),
    ).toBeNull();
  });
});
