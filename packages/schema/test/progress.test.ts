import { describe, expect, it } from 'vitest';
import {
  isItemDone,
  itemStates,
  itemsOf,
  progressId,
  progressPercent,
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

  it('marks the first unfinished item current and the Pariksha blocking what follows', () => {
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

  it('never locks when the course is not sequential', () => {
    const open = makeCourse({
      rules: { sequential: false, passMark: 0.7, certificate: true, requireVideoWatch: false },
    });
    expect(itemStates(open, { ...none, completedItemIds: ['l1'] })).toEqual({
      l1: 'done',
      q1: 'current',
      l2: 'todo',
      l3: 'todo',
    });
  });

  it('does not lock behind a Pariksha that does not block', () => {
    const c = makeCourse();
    const p = itemAt(c, 1);
    if (p.type === 'pariksha') p.blocksNext = false;
    expect(itemStates(c, { ...none, completedItemIds: ['l1'] }).l2).toBe('todo');
  });
});
