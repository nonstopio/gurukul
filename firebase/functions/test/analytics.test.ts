import { describe, expect, it, vi } from 'vitest';
import {
  activeWindowStart,
  addParvaCompletions,
  emptyDelta,
  handleAttemptCreated,
  isEmptyDelta,
  planProgressStats,
  runDailyRollup,
} from '../src/analytics.js';
import type { AttemptStatsStore, RollupStore } from '../src/analytics.js';

const ts = (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) });
const DAY = 86_400_000;
const lesson = (id: string) => ({ type: 'lesson', id }) as never;
const pariksha = (id: string) => ({ type: 'pariksha', id }) as never;
const course = {
  parvas: [
    { id: 'p1', items: [lesson('l1'), lesson('l2')] },
    { id: 'p2', items: [lesson('l3'), pariksha('pk')] },
    { id: 'p3', items: [] },
  ],
} as never;
const progress = (over: object = {}) =>
  ({
    uid: 'u',
    courseId: 'git',
    courseVersion: 1,
    startedAt: ts(0),
    lastItemId: null,
    lastActiveAt: ts(0),
    completedItemIds: [],
    pariksha: {},
    percent: 0,
    completedAt: null,
    certificateId: null,
    ...over,
  }) as never;
const AT = new Date('2026-10-27T00:00:00Z');

describe('planProgressStats', () => {
  it('counts a start and nothing else for a fresh progress document', () => {
    const d = planProgressStats(course, undefined, progress(), AT);
    expect(d).toEqual({ ...emptyDelta('2026-W44'), started: 1 });
    expect(isEmptyDelta(d)).toBe(false);
  });

  it('counts the lessons that became done and the parva they finished', () => {
    const d = planProgressStats(
      course,
      progress({ completedItemIds: ['l1'] }),
      progress({ completedItemIds: ['l1', 'l2', 'l3', 'gone'] }),
      AT,
    );
    expect(d.lessons).toBe(2);
    expect(d.parvasDone).toEqual([0]);
    expect(d.started).toBe(0);
  });

  it('counts a Pariksha pass toward its parva but not as a lesson', () => {
    const before = progress({ completedItemIds: ['l1', 'l2', 'l3'] });
    const after = progress({
      completedItemIds: ['l1', 'l2', 'l3'],
      pariksha: { pk: { best: 1, passed: true, attempts: 1, lastAttemptAt: ts(1) } },
    });
    const d = planProgressStats(course, before, after, AT);
    expect(d.parvasDone).toEqual([1]);
    expect(d.lessons).toBe(0);
  });

  it('counts a completion with its finish time, once', () => {
    const before = progress({ startedAt: ts(0) });
    const after = progress({ startedAt: ts(0), completedAt: ts(3 * DAY) });
    const d = planProgressStats(course, before, after, AT);
    expect(d.completed).toBe(1);
    expect(d.finishDays).toBe(3);
    expect(planProgressStats(course, after, after, AT).completed).toBe(0);
    expect(isEmptyDelta(planProgressStats(course, after, after, AT))).toBe(true);
  });

  it('never reports a negative finish time', () => {
    const d = planProgressStats(
      course,
      progress(),
      progress({ startedAt: ts(5 * DAY), completedAt: ts(DAY) }),
      AT,
    );
    expect(d.finishDays).toBe(0);
  });

  it('counts nothing when nothing changed, even when everything is done', () => {
    const all = progress({
      completedItemIds: ['l1', 'l2', 'l3'],
      pariksha: { pk: { best: 1, passed: true, attempts: 1, lastAttemptAt: ts(1) } },
    });
    expect(isEmptyDelta(planProgressStats(course, all, all, AT))).toBe(true);
  });

  it('treats each field of a delta as a change', () => {
    const base = emptyDelta('w');
    expect(isEmptyDelta(base)).toBe(true);
    for (const over of [
      { started: 1 },
      { completed: 1 },
      { certified: 1 },
      { finishDays: 1 },
      { parvasDone: [0] },
      { lessons: 1 },
      { assignmentsCompleted: 1 },
    ]) {
      expect(isEmptyDelta({ ...base, ...over })).toBe(false);
    }
  });
});

describe('addParvaCompletions', () => {
  it('increments in place and pads with zeros', () => {
    expect(addParvaCompletions([2, 1], [1])).toEqual([2, 2]);
    expect(addParvaCompletions([], [2, 0, 2])).toEqual([1, 0, 2]);
    expect(addParvaCompletions([1], [])).toEqual([1]);
  });
});

describe('handleAttemptCreated', () => {
  const attempt = {
    uid: 'u',
    courseId: 'git',
    parikshaId: 'pk',
    score: 0.5,
    results: [
      { questionId: 'q1', correct: true },
      { questionId: 'q2', correct: false },
    ],
  };
  const store = (progressRaw: unknown): AttemptStatsStore => ({
    progress: vi.fn().mockResolvedValue(progressRaw),
    bumpAttemptStats: vi.fn().mockResolvedValue(undefined),
  });
  const withAttempts = (attempts: number) =>
    progress({ pariksha: { pk: { best: 0.5, passed: false, attempts, lastAttemptAt: ts(1) } } });

  it('counts the score and, for the first attempt, each question', async () => {
    const s = store(withAttempts(1));
    expect(await handleAttemptCreated(s, attempt)).toBe('counted');
    expect(s.progress).toHaveBeenCalledWith('u', 'git');
    expect(s.bumpAttemptStats).toHaveBeenCalledWith('git', {
      scoreSum: 0.5,
      scoreCount: 1,
      questionFirstTry: { q1: { correct: 1, total: 1 }, q2: { correct: 0, total: 1 } },
    });
  });

  it('counts only the score for a retake, an unreadable progress or an old attempt', async () => {
    for (const progressRaw of [withAttempts(2), undefined, progress()]) {
      const s = store(progressRaw);
      await handleAttemptCreated(s, attempt);
      expect(s.bumpAttemptStats).toHaveBeenCalledWith('git', {
        scoreSum: 0.5,
        scoreCount: 1,
        questionFirstTry: {},
      });
    }
    const old = store(withAttempts(1));
    await handleAttemptCreated(old, { ...attempt, results: undefined });
    expect(old.bumpAttemptStats).toHaveBeenCalledWith(
      'git',
      expect.objectContaining({ questionFirstTry: {} }),
    );
  });

  it('ignores a document that is not an attempt', async () => {
    const s = store(undefined);
    expect(await handleAttemptCreated(s, { nope: 1 })).toBe('ignored');
    expect(await handleAttemptCreated(s, undefined)).toBe('ignored');
    expect(s.progress).not.toHaveBeenCalled();
  });
});

describe('runDailyRollup', () => {
  it('recomputes the org counters from count queries', async () => {
    const now = Date.UTC(2026, 9, 27);
    const store: RollupStore = {
      countUsers: vi.fn().mockResolvedValue(120),
      countActiveSince: vi.fn().mockResolvedValue(80),
      countAssignments: vi.fn().mockResolvedValue(300),
      countCompletedAssignments: vi.fn().mockResolvedValue(90),
      writeOrgCounts: vi.fn().mockResolvedValue(undefined),
    };
    const counts = await runDailyRollup(store, now);
    expect(counts).toEqual({
      usersTotal: 120,
      activeLearners30d: 80,
      assignmentsTotal: 300,
      assignmentsCompleted: 90,
    });
    expect(store.countActiveSince).toHaveBeenCalledWith(now - 30 * DAY);
    expect(store.writeOrgCounts).toHaveBeenCalledWith(counts);
  });

  it('opens the window 30 days back', () => {
    expect(activeWindowStart(30 * DAY)).toBe(0);
  });
});
