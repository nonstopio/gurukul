import { describe, expect, it, vi } from 'vitest';
import {
  activeWindowStart,
  addChapterCompletions,
  emptyDelta,
  handleAttemptCreated,
  isEmptyDelta,
  planProgressStats,
  planRoster,
  recountCourse,
  runDailyRollup,
} from '../src/analytics.js';
import type { AttemptStatsStore, RollupStore } from '../src/analytics.js';
import { course as fixtureCourse, progress as fixtureProgress } from './fixtures.js';

const ts = (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) });
const DAY = 86_400_000;
const lesson = (id: string) => ({ type: 'lesson', id }) as never;
const quiz = (id: string) => ({ type: 'quiz', id }) as never;
const course = {
  chapters: [
    { id: 'p1', items: [lesson('l1'), lesson('l2')] },
    { id: 'p2', items: [lesson('l3'), quiz('pk')] },
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
    quiz: {},
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

  it('counts the lessons that became done and the chapter they finished', () => {
    const d = planProgressStats(
      course,
      progress({ completedItemIds: ['l1'] }),
      progress({ completedItemIds: ['l1', 'l2', 'l3', 'gone'] }),
      AT,
    );
    expect(d.lessons).toBe(2);
    expect(d.chaptersDone).toEqual([0]);
    expect(d.started).toBe(0);
  });

  it('counts a Quiz pass toward its chapter but not as a lesson', () => {
    const before = progress({ completedItemIds: ['l1', 'l2', 'l3'] });
    const after = progress({
      completedItemIds: ['l1', 'l2', 'l3'],
      quiz: { pk: { best: 1, passed: true, attempts: 1, lastAttemptAt: ts(1) } },
    });
    const d = planProgressStats(course, before, after, AT);
    expect(d.chaptersDone).toEqual([1]);
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
      quiz: { pk: { best: 1, passed: true, attempts: 1, lastAttemptAt: ts(1) } },
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
      { chaptersDone: [0] },
      { lessons: 1 },
      { assignmentsCompleted: 1 },
    ]) {
      expect(isEmptyDelta({ ...base, ...over })).toBe(false);
    }
  });
});

describe('addChapterCompletions', () => {
  it('increments in place and pads with zeros', () => {
    expect(addChapterCompletions([2, 1], [1])).toEqual([2, 2]);
    expect(addChapterCompletions([], [2, 0, 2])).toEqual([1, 0, 2]);
    expect(addChapterCompletions([1], [])).toEqual([1]);
  });
});

describe('handleAttemptCreated', () => {
  const attempt = {
    uid: 'u',
    courseId: 'git',
    quizId: 'pk',
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
    progress({ quiz: { pk: { best: 0.5, passed: false, attempts, lastAttemptAt: ts(1) } } });

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

describe('recountCourse', () => {
  it('starts at zero, one slot per chapter', () => {
    expect(recountCourse(course as never, [])).toEqual({
      started: 0,
      completed: 0,
      certified: 0,
      chapterCompletions: [0, 0, 0],
      finishDaysSum: 0,
      finishDaysHistogram: {},
    });
  });

  it('counts starts, completions, certificates, finish days and finished chapters from progress', () => {
    const passed = { pk: { best: 1, passed: true, attempts: 1, lastAttemptAt: ts(1) } };
    const r = recountCourse(course as never, [
      progress({ completedItemIds: ['l1'] }),
      progress({ uid: 'v', completedItemIds: ['l1', 'l2'] }),
      progress({
        uid: 'w',
        completedItemIds: ['l1', 'l2', 'l3'],
        quiz: passed,
        startedAt: ts(DAY),
        completedAt: ts(3 * DAY),
        certificateId: 'NSG-GIT-26-0001',
      }),
      progress({ uid: 'x', startedAt: ts(5 * DAY), completedAt: ts(DAY) }),
      { not: 'progress' },
    ]);
    expect(r).toEqual({
      started: 4,
      completed: 2,
      certified: 1,
      finishDaysSum: 2,
      finishDaysHistogram: { '0': 1, '2': 1 },
      chapterCompletions: [2, 1, 0],
    });
  });
});

describe('runDailyRollup', () => {
  const NOW = Date.UTC(2026, 9, 27);
  const LAST = NOW - DAY;
  const zero = {
    started: 0,
    completed: 0,
    certified: 0,
    chapterCompletions: [0],
    finishDaysSum: 0,
    finishDaysHistogram: {},
  };
  const store = (over: Partial<RollupStore> = {}): RollupStore => ({
    countUsers: vi.fn().mockResolvedValue(120),
    countActiveSince: vi.fn().mockResolvedValue(80),
    countAssignments: vi.fn().mockResolvedValue(300),
    countCompletedAssignments: vi.fn().mockResolvedValue(90),
    countCourseAssignments: vi.fn().mockResolvedValue(7),
    lastRun: vi.fn().mockResolvedValue({ ranAt: LAST, retry: [] }),
    finishRun: vi.fn().mockResolvedValue(undefined),
    courses: vi.fn().mockResolvedValue([
      { id: 'git-basics', publishedAtMs: 1, data: fixtureCourse() },
      { id: 'quiet', publishedAtMs: 1, data: fixtureCourse() },
      { id: 'broken', publishedAtMs: 1, data: { schemaVersion: 99 } },
    ]),
    progressActiveSince: vi.fn().mockResolvedValue([fixtureProgress(), { not: 'progress' }]),
    courseProgress: vi.fn().mockResolvedValue([fixtureProgress(), fixtureProgress()]),
    learnerProgress: vi.fn().mockResolvedValue([]),
    courseStats: vi.fn().mockResolvedValue({ started: 5, completed: 1, version: 'v1' }),
    userNames: vi.fn().mockResolvedValue(new Map([['u', 'Asha Rao']])),
    rosters: vi.fn().mockResolvedValue(new Map()),
    writeRoster: vi.fn().mockResolvedValue(undefined),
    writeOrgCounts: vi.fn().mockResolvedValue(undefined),
    writeAssigned: vi.fn().mockResolvedValue(undefined),
    writeCourseCounts: vi.fn().mockResolvedValue(true),
    ...over,
  });
  const org = {
    usersTotal: 120,
    activeLearners30d: 80,
    assignmentsTotal: 300,
    assignmentsCompleted: 90,
  };

  it('writes the org totals, then recounts only the course with activity since the last run', async () => {
    const s = store();
    const summary = await runDailyRollup(s, NOW);
    expect(summary).toEqual({
      ...org,
      courses: 2,
      recounted: 1,
      skipped: 0,
      progressDocs: 3,
      rosterWrites: 1,
    });
    expect(s.countActiveSince).toHaveBeenCalledWith(NOW - 30 * DAY);
    expect(s.writeOrgCounts).toHaveBeenCalledWith(org);
    expect(s.progressActiveSince).toHaveBeenCalledWith(LAST - 5 * 60_000);
    expect(s.courseProgress).toHaveBeenCalledTimes(1);
    expect(s.courseProgress).toHaveBeenCalledWith('git-basics');
    expect(s.writeCourseCounts).toHaveBeenCalledTimes(1);
    expect(s.writeCourseCounts).toHaveBeenCalledWith(
      'git-basics',
      { assigned: 7, ...zero, started: 2 },
      { version: 'v1', org: { started: -3, completed: -1 } },
    );
    expect(s.writeAssigned).toHaveBeenCalledTimes(1);
    expect(s.writeAssigned).toHaveBeenCalledWith('quiet', 7);
    expect(s.userNames).toHaveBeenCalledWith(['u']);
    expect(s.rosters).toHaveBeenCalledWith([
      expect.objectContaining({ courseId: 'git-basics', uid: 'u' }),
    ]);
    expect(s.writeRoster).toHaveBeenCalledWith([
      { courseId: 'git-basics', uid: 'u', displayName: 'Asha Rao', startedAt: expect.anything() },
    ]);
    expect(s.finishRun).toHaveBeenCalledWith({ ranAt: NOW, retry: [] });
  });

  it('reads the stored counters before the progress documents', async () => {
    const s = store();
    await runDailyRollup(s, NOW);
    expect(vi.mocked(s.courseStats).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(s.courseProgress).mock.invocationCallOrder[0] as number,
    );
  });

  it('recounts every course on the first run', async () => {
    const s = store({
      lastRun: vi.fn().mockResolvedValue({ ranAt: null, retry: [] }),
      progressActiveSince: vi.fn().mockResolvedValue([]),
      courses: vi
        .fn()
        .mockResolvedValue([{ id: 'quiet', publishedAtMs: 0, data: fixtureCourse() }]),
    });
    const summary = await runDailyRollup(s, NOW);
    expect(s.progressActiveSince).toHaveBeenCalledWith(0);
    expect(summary).toMatchObject({ recounted: 1, progressDocs: 2, rosterWrites: 0 });
    expect(s.writeAssigned).not.toHaveBeenCalled();
    expect(s.userNames).not.toHaveBeenCalled();
    expect(s.writeRoster).not.toHaveBeenCalled();
  });

  it('recounts a course published since the last run and one the last run skipped', async () => {
    const s = store({
      lastRun: vi.fn().mockResolvedValue({ ranAt: LAST, retry: ['quiet'] }),
      progressActiveSince: vi.fn().mockResolvedValue([]),
      courses: vi.fn().mockResolvedValue([
        { id: 'git-basics', publishedAtMs: LAST, data: fixtureCourse() },
        { id: 'quiet', publishedAtMs: 1, data: fixtureCourse() },
        { id: 'old', publishedAtMs: LAST - 5 * 60_000 - 1, data: fixtureCourse() },
      ]),
    });
    expect((await runDailyRollup(s, NOW)).recounted).toBe(2);
    expect(vi.mocked(s.courseProgress).mock.calls).toEqual([['git-basics'], ['quiet']]);
    expect(s.writeAssigned).toHaveBeenCalledWith('old', 7);
  });

  it('leaves a course a trigger wrote to meanwhile for the next run', async () => {
    const s = store({ writeCourseCounts: vi.fn().mockResolvedValue(false) });
    expect(await runDailyRollup(s, NOW)).toMatchObject({ recounted: 0, skipped: 1 });
    expect(s.finishRun).toHaveBeenCalledWith({ ranAt: NOW, retry: ['git-basics'] });
  });

  it('writes no roster entries when the active learners are current, or their course is gone', async () => {
    const s = store({
      rosters: vi.fn().mockResolvedValue(new Map([['git-basics', new Map([['u', 'Asha Rao']])]])),
    });
    expect((await runDailyRollup(s, NOW)).rosterWrites).toBe(0);
    expect(s.writeRoster).not.toHaveBeenCalled();
    expect(s.learnerProgress).not.toHaveBeenCalled();
    const gone = store({
      progressActiveSince: vi
        .fn()
        .mockResolvedValue([fixtureProgress(undefined, { courseId: 'gone' })]),
    });
    expect((await runDailyRollup(gone, NOW)).rosterWrites).toBe(0);
    expect(gone.rosters).not.toHaveBeenCalled();
  });

  it('copies a rename to every course of the learner, and only adds a missing entry', async () => {
    const other = fixtureProgress(undefined, { courseId: 'quiet' });
    const s = store({
      progressActiveSince: vi
        .fn()
        .mockResolvedValue([fixtureProgress(), fixtureProgress(undefined, { uid: 'new' })]),
      userNames: vi.fn().mockResolvedValue(
        new Map([
          ['u', 'Asha Rao'],
          ['new', 'Meera Iyer'],
        ]),
      ),
      rosters: vi.fn().mockResolvedValue(new Map([['git-basics', new Map([['u', 'Asha']])]])),
      learnerProgress: vi.fn().mockResolvedValue([fixtureProgress(), other]),
    });
    await runDailyRollup(s, NOW);
    expect(s.learnerProgress).toHaveBeenCalledTimes(1);
    expect(s.learnerProgress).toHaveBeenCalledWith('u');
    expect(vi.mocked(s.writeRoster).mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ courseId: 'git-basics', uid: 'new', displayName: 'Meera Iyer' }),
      expect.objectContaining({ courseId: 'git-basics', uid: 'u', displayName: 'Asha Rao' }),
      expect.objectContaining({ courseId: 'quiet', uid: 'u', displayName: 'Asha Rao' }),
    ]);
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
