import { describe, expect, it, vi } from 'vitest';
import {
  activeWindowStart,
  addParvaCompletions,
  emptyDelta,
  handleAttemptCreated,
  isEmptyDelta,
  planProgressStats,
  planRoster,
  recountFromSource,
  runDailyRollup,
} from '../src/analytics.js';
import type { AttemptStatsStore, RollupStore } from '../src/analytics.js';
import { course as fixtureCourse, progress as fixtureProgress } from './fixtures.js';

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
    expect(d.finishBucket).toBe('3');
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
    expect(d.finishBucket).toBe('0');
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

  it('counts the score and, for the first attempt, each question and the first try', async () => {
    const s = store(withAttempts(1));
    expect(await handleAttemptCreated(s, attempt)).toBe('counted');
    expect(s.progress).toHaveBeenCalledWith('u', 'git');
    expect(s.bumpAttemptStats).toHaveBeenCalledWith('git', {
      scoreSum: 0.5,
      scoreCount: 1,
      questionFirstTry: { q1: { correct: 1, total: 1 }, q2: { correct: 0, total: 1 } },
      firstTryTotal: 1,
      firstTryPassed: 0,
    });
  });

  it('counts a first attempt that passed as a first-try pass', async () => {
    const s = store(withAttempts(1));
    await handleAttemptCreated(s, { ...attempt, passed: true });
    expect(s.bumpAttemptStats).toHaveBeenCalledWith(
      'git',
      expect.objectContaining({ firstTryTotal: 1, firstTryPassed: 1 }),
    );
  });

  it('counts only the score for a retake, an unreadable progress or an old attempt', async () => {
    for (const progressRaw of [withAttempts(2), undefined, progress()]) {
      const s = store(progressRaw);
      await handleAttemptCreated(s, { ...attempt, passed: true });
      expect(s.bumpAttemptStats).toHaveBeenCalledWith('git', {
        scoreSum: 0.5,
        scoreCount: 1,
        questionFirstTry: {},
        firstTryTotal: 0,
        firstTryPassed: 0,
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

describe('recountFromSource', () => {
  const courses = new Map([['git', course]]) as never;
  const attempt = (id: string, at: number, over: object = {}) => ({
    id,
    createdAtMs: at,
    data: {
      uid: 'u',
      courseId: 'git',
      parikshaId: 'pk',
      score: 0.5,
      passed: false,
      results: [
        { questionId: 'q1', correct: true },
        { questionId: 'q2', correct: false },
      ],
      ...over,
    },
  });

  it('starts every known course at zero, one slot per parva', () => {
    const r = recountFromSource(courses, [], []);
    expect(r.courses).toEqual({
      git: {
        started: 0,
        completed: 0,
        certified: 0,
        scoreSum: 0,
        scoreCount: 0,
        parvaCompletions: [0, 0, 0],
        questionFirstTry: {},
        finishDaysSum: 0,
        finishDaysHistogram: {},
      },
    });
    expect(r.org).toEqual({
      started: 0,
      completed: 0,
      parikshaScoreSum: 0,
      parikshaScoreCount: 0,
      parikshaFirstTryTotal: 0,
      parikshaFirstTryPassed: 0,
    });
  });

  it('counts starts, completions, certificates, finish days and finished parvas from progress', () => {
    const passed = { pk: { best: 1, passed: true, attempts: 1, lastAttemptAt: ts(1) } };
    const r = recountFromSource(
      courses,
      [
        progress({ completedItemIds: ['l1'] }),
        progress({ uid: 'v', completedItemIds: ['l1', 'l2'] }),
        progress({
          uid: 'w',
          completedItemIds: ['l1', 'l2', 'l3'],
          pariksha: passed,
          startedAt: ts(DAY),
          completedAt: ts(3 * DAY),
          certificateId: 'NSG-GIT-26-0001',
        }),
        progress({ uid: 'x', startedAt: ts(5 * DAY), completedAt: ts(DAY) }),
        progress({ courseId: 'gone' }),
        { not: 'progress' },
      ],
      [],
    );
    expect(r.courses.git).toMatchObject({
      started: 4,
      completed: 2,
      certified: 1,
      finishDaysSum: 2,
      finishDaysHistogram: { '0': 1, '2': 1 },
      parvaCompletions: [2, 1, 0],
    });
    expect(r.org).toMatchObject({ started: 4, completed: 2 });
  });

  it('sums every score and counts each learner’s earliest attempt as their first try', () => {
    const r = recountFromSource(
      courses,
      [],
      [
        attempt('b', 20, {
          score: 1,
          passed: true,
          results: [{ questionId: 'q1', correct: true }],
        }),
        attempt('a', 10),
        attempt('h', 30, { score: 0, results: [] }),
        attempt('d', 10, { uid: 'v', score: 0, results: [] }),
        attempt('c', 10, { uid: 'v', passed: true }),
        attempt('z', 10, { uid: 'v', score: 0, results: [] }),
        attempt('e', 5, { uid: 'v', parikshaId: 'other', score: 0, results: undefined }),
        attempt('f', 1, { courseId: 'gone' }),
        { id: 'g', createdAtMs: 0, data: { nope: 1 } },
      ],
    );
    expect(r.courses.git).toMatchObject({
      scoreSum: 2,
      scoreCount: 7,
      questionFirstTry: { q1: { correct: 2, total: 2 }, q2: { correct: 0, total: 2 } },
    });
    expect(r.org).toMatchObject({
      parikshaScoreSum: 2,
      parikshaScoreCount: 7,
      parikshaFirstTryTotal: 3,
      parikshaFirstTryPassed: 1,
    });
  });
});

describe('runDailyRollup', () => {
  const store = (over: Partial<RollupStore> = {}): RollupStore => ({
    countUsers: vi.fn().mockResolvedValue(120),
    countActiveSince: vi.fn().mockResolvedValue(80),
    countAssignments: vi.fn().mockResolvedValue(300),
    countCompletedAssignments: vi.fn().mockResolvedValue(90),
    countCourseAssignments: vi.fn().mockResolvedValue(7),
    courses: vi.fn().mockResolvedValue([
      { id: 'git-basics', data: fixtureCourse() },
      { id: 'broken', data: { schemaVersion: 99 } },
    ]),
    progress: vi.fn().mockResolvedValue([fixtureProgress()]),
    attempts: vi.fn().mockResolvedValue([
      {
        id: 'a',
        createdAtMs: 1,
        data: { uid: 'u', courseId: 'git-basics', parikshaId: 'pk', score: 1, passed: true },
      },
    ]),
    writeOrgCounts: vi.fn().mockResolvedValue(undefined),
    writeCourseCounts: vi.fn().mockResolvedValue(undefined),
    userNames: vi.fn().mockResolvedValue(new Map([['u', 'Asha Rao']])),
    roster: vi.fn().mockResolvedValue(new Map()),
    writeRoster: vi.fn().mockResolvedValue(undefined),
    ...over,
  });

  it('recomputes the org and course counters from source and overwrites them', async () => {
    const now = Date.UTC(2026, 9, 27);
    const s = store();
    const summary = await runDailyRollup(s, now);
    const org = {
      usersTotal: 120,
      activeLearners30d: 80,
      assignmentsTotal: 300,
      assignmentsCompleted: 90,
      started: 1,
      completed: 0,
      parikshaScoreSum: 1,
      parikshaScoreCount: 1,
      parikshaFirstTryTotal: 1,
      parikshaFirstTryPassed: 1,
    };
    expect(summary).toEqual({ ...org, courses: 1, progressDocs: 1, attempts: 1, rosterWrites: 1 });
    expect(s.roster).toHaveBeenCalledWith('git-basics');
    expect(s.writeRoster).toHaveBeenCalledWith([
      { courseId: 'git-basics', uid: 'u', displayName: 'Asha Rao', startedAt: expect.anything() },
    ]);
    expect(s.countActiveSince).toHaveBeenCalledWith(now - 30 * DAY);
    expect(s.writeOrgCounts).toHaveBeenCalledWith(org);
    expect(s.countCourseAssignments).toHaveBeenCalledWith('git-basics');
    expect(s.writeCourseCounts).toHaveBeenCalledTimes(1);
    expect(s.writeCourseCounts).toHaveBeenCalledWith('git-basics', {
      assigned: 7,
      started: 1,
      completed: 0,
      certified: 0,
      scoreSum: 1,
      scoreCount: 1,
      parvaCompletions: [0],
      questionFirstTry: {},
      finishDaysSum: 0,
      finishDaysHistogram: {},
    });
  });

  it('writes no roster entries when every roster is current', async () => {
    const s = store({ roster: vi.fn().mockResolvedValue(new Map([['u', 'Asha Rao']])) });
    expect((await runDailyRollup(s, 0)).rosterWrites).toBe(0);
    expect(s.writeRoster).not.toHaveBeenCalled();
  });

  it('opens the window 30 days back', () => {
    expect(activeWindowStart(30 * DAY)).toBe(0);
  });
});

describe('planRoster', () => {
  const courses = new Map([['git-basics', {}]]);
  const p = (uid: string, over: object = {}) => fixtureProgress(undefined, { uid, ...over });
  const rosters = new Map([
    [
      'git-basics',
      new Map([
        ['same', 'Asha Rao'],
        ['renamed', 'Asha'],
        ['noProfile', 'Ravi Kumar'],
      ]),
    ],
  ]);
  const names = new Map([
    ['same', 'Asha Rao'],
    ['renamed', 'Asha Rao'],
    ['missing', 'Meera Iyer'],
  ]);

  it('adds missing learners and copies renames, leaving current and profile-less names', () => {
    const docs = [p('same'), p('renamed'), p('noProfile'), p('missing'), p('ghost')];
    expect(planRoster(courses, docs, names, rosters)).toEqual([
      {
        courseId: 'git-basics',
        uid: 'renamed',
        displayName: 'Asha Rao',
        startedAt: docs[1]?.startedAt,
      },
      {
        courseId: 'git-basics',
        uid: 'missing',
        displayName: 'Meera Iyer',
        startedAt: docs[3]?.startedAt,
      },
      { courseId: 'git-basics', uid: 'ghost', displayName: '', startedAt: docs[4]?.startedAt },
    ]);
  });

  it('ignores unreadable progress and courses that do not exist or have no roster read', () => {
    const docs = [{ bad: true }, p('missing', { courseId: 'gone' })];
    expect(planRoster(courses, docs, names, rosters)).toEqual([]);
    expect(planRoster(courses, [p('missing')], names, new Map())).toHaveLength(1);
  });
});
