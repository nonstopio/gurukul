import { describe, expect, it, vi } from 'vitest';
import { checkAnswer, checkCooldown, gradeAttempt, isCorrect, nextResult } from '../src/grading.js';
import type { GradingStore } from '../src/grading.js';
import { answerKey, course, progress, ts } from './fixtures.js';

const NOW = 1_000_000_000_000;

function store(over: Partial<Record<keyof GradingStore, unknown>> = {}): GradingStore {
  return {
    getCourse: vi.fn().mockResolvedValue(course()),
    getAnswers: vi.fn().mockResolvedValue(answerKey),
    getProgress: vi.fn().mockResolvedValue(progress()),
    recordAttempt: vi.fn(async (_a, decide: (p: unknown) => unknown) => ({
      attemptId: 'att1',
      update: decide(progress()),
    })),
    ...over,
  } as GradingStore;
}

const grade = (s: GradingStore, data: object = {}) =>
  gradeAttempt(
    s,
    'u',
    {
      courseId: 'git-basics',
      parikshaId: 'pk',
      questionIds: ['q1', 'q2'],
      answers: { q1: ['a'], q2: ['b', 'a'] },
      ...data,
    },
    NOW,
  );
const rejects = (p: Promise<unknown>, code: string) => expect(p).rejects.toMatchObject({ code });

describe('isCorrect', () => {
  it('needs exactly the one key id for single, true/false and code-output questions', () => {
    for (const kind of ['single', 'trueFalse', 'codeOutput'] as const) {
      expect(isCorrect(kind, ['a'], ['a'])).toBe(true);
      expect(isCorrect(kind, ['b'], ['a'])).toBe(false);
      expect(isCorrect(kind, ['a', 'b'], ['a'])).toBe(false);
      expect(isCorrect(kind, ['a', 'a'], ['a'])).toBe(false);
    }
  });

  it('needs the same set for multiple choice, in any order', () => {
    expect(isCorrect('multiple', ['b', 'a'], ['a', 'b'])).toBe(true);
    expect(isCorrect('multiple', ['a'], ['a', 'b'])).toBe(false);
    expect(isCorrect('multiple', ['a', 'b', 'c'], ['a', 'b'])).toBe(false);
    expect(isCorrect('multiple', ['a', 'c'], ['a', 'b'])).toBe(false);
    expect(isCorrect('multiple', ['a', 'a'], ['a', 'b'])).toBe(false);
  });

  it('never counts an empty selection', () => {
    expect(isCorrect('single', [], [])).toBe(false);
    expect(isCorrect('multiple', [], ['a'])).toBe(false);
  });
});

describe('checkAnswer', () => {
  const data = { courseId: 'git-basics', parikshaId: 'pk', questionId: 'q1', selected: ['a'] };

  it('says right or wrong and gives the key and the explanation', async () => {
    expect(await checkAnswer(store(), data)).toEqual({
      correct: true,
      correctOptionIds: ['a'],
      explanation: 'why q1',
    });
    expect(await checkAnswer(store(), { ...data, selected: ['b'] })).toMatchObject({
      correct: false,
    });
    expect(await checkAnswer(store(), { ...data, selected: [] })).toMatchObject({ correct: false });
  });

  it('rejects malformed requests', async () => {
    for (const bad of [
      { ...data, courseId: '' },
      { ...data, parikshaId: 1 },
      { ...data, questionId: undefined },
      { ...data, selected: 'a' },
      { ...data, selected: [1] },
    ]) {
      await rejects(checkAnswer(store(), bad), 'invalid-argument');
    }
  });

  it('rejects unknown, unpublished and unreadable courses', async () => {
    await rejects(
      checkAnswer(store({ getCourse: vi.fn().mockResolvedValue(undefined) }), data),
      'not-found',
    );
    await rejects(
      checkAnswer(
        store({ getCourse: vi.fn().mockResolvedValue(course({}, { status: 'draft' })) }),
        data,
      ),
      'not-found',
    );
    await rejects(
      checkAnswer(store({ getCourse: vi.fn().mockResolvedValue({ broken: true }) }), data),
      'failed-precondition',
    );
  });

  it('rejects unknown Pariksha and question ids', async () => {
    await rejects(checkAnswer(store(), { ...data, parikshaId: 'nope' }), 'invalid-argument');
    await rejects(checkAnswer(store(), { ...data, questionId: 'nope' }), 'invalid-argument');
  });

  it('refuses unless answers are revealed after each one, without reading the key', async () => {
    for (const revealAnswers of ['onPass', 'never']) {
      const s = store({ getCourse: vi.fn().mockResolvedValue(course({ revealAnswers })) });
      await rejects(checkAnswer(s, data), 'failed-precondition');
      expect(s.getAnswers).not.toHaveBeenCalled();
    }
  });

  it('fails cleanly when the answer key is missing', async () => {
    await rejects(
      checkAnswer(store({ getAnswers: vi.fn().mockResolvedValue(undefined) }), data),
      'failed-precondition',
    );
    await rejects(
      checkAnswer(store({ getAnswers: vi.fn().mockResolvedValue({ pk: {} }) }), data),
      'failed-precondition',
    );
    await rejects(
      checkAnswer(store({ getAnswers: vi.fn().mockResolvedValue({ pk: { q1: 'a' } }) }), data),
      'failed-precondition',
    );
  });
});

describe('checkCooldown and nextResult', () => {
  it('needs a started course', () => {
    expect(() => checkCooldown(undefined, 'pk', 10, NOW)).toThrow(/Start the course/);
    expect(() => checkCooldown({ junk: 1 }, 'pk', 10, NOW)).toThrow(/Start the course/);
  });

  it('allows a first attempt and one after the cooldown, and refuses one inside it', () => {
    expect(checkCooldown(progress(), 'pk', 10, NOW)).toBeUndefined();
    const prev = { best: 0.5, passed: false, attempts: 1, lastAttemptAt: ts(NOW - 10 * 60_000) };
    expect(checkCooldown(progress(prev), 'pk', 10, NOW)).toMatchObject({ best: 0.5 });
    const recent = { ...prev, lastAttemptAt: ts(NOW - 60_000) };
    try {
      checkCooldown(progress(recent), 'pk', 10, NOW);
      expect.unreachable();
    } catch (e) {
      expect(e).toMatchObject({
        code: 'resource-exhausted',
        details: { nextAttemptAt: NOW + 9 * 60_000 },
      });
    }
  });

  it('never lowers best or un-passes, and counts attempts', () => {
    expect(nextResult(undefined, 0.5, false)).toEqual({ best: 0.5, passed: false, attempts: 1 });
    const prev = { best: 0.9, passed: true, attempts: 2, lastAttemptAt: ts(1) };
    expect(nextResult(prev, 0.4, false)).toEqual({ best: 0.9, passed: true, attempts: 3 });
    expect(nextResult({ ...prev, best: 0.2, passed: false }, 0.8, true)).toEqual({
      best: 0.8,
      passed: true,
      attempts: 3,
    });
  });
});

describe('gradeAttempt', () => {
  it('scores, records one attempt and returns the key when answers are revealed after each', async () => {
    const s = store();
    const out = await grade(s);
    expect(out).toEqual({
      attemptId: 'att1',
      score: 1,
      correctCount: 2,
      total: 2,
      passed: true,
      best: 1,
      results: [
        { questionId: 'q1', correct: true, correctOptionIds: ['a'], explanation: 'why q1' },
        { questionId: 'q2', correct: true, correctOptionIds: ['a', 'b'], explanation: 'why q2' },
      ],
      nextAttemptAt: NOW + 600_000,
    });
    expect(s.recordAttempt).toHaveBeenCalledWith(
      {
        uid: 'u',
        courseId: 'git-basics',
        parikshaId: 'pk',
        score: 1,
        correctCount: 2,
        total: 2,
        passed: true,
        answers: { q1: ['a'], q2: ['b', 'a'] },
        questionIds: ['q1', 'q2'],
        courseVersion: 3,
      },
      expect.any(Function),
    );
  });

  it('counts unanswered questions as incorrect and uses the Pariksha pass mark over the course one', async () => {
    const half = store({
      getCourse: vi.fn().mockResolvedValue(course({ passMark: 0.5 })),
    });
    const out = await grade(half, { answers: { q1: ['a'] } });
    expect(out).toMatchObject({ score: 0.5, correctCount: 1, passed: true });
    expect(out.results[1]).toMatchObject({ questionId: 'q2', correct: false });
    const strict = await grade(store(), { answers: { q1: ['a'] } });
    expect(strict).toMatchObject({ score: 0.5, passed: false });
  });

  it('falls back to the course pass mark and hides the key until a pass on onPass', async () => {
    const onPass = (revealAnswers: string) =>
      store({ getCourse: vi.fn().mockResolvedValue(course({ revealAnswers })) });
    const failed = await grade(onPass('onPass'), { answers: {} });
    expect(failed.passed).toBe(false);
    expect(failed.results).toEqual([
      { questionId: 'q1', correct: false },
      { questionId: 'q2', correct: false },
    ]);
    expect((await grade(onPass('onPass'))).results[0]).toHaveProperty('correctOptionIds');
    expect((await grade(onPass('never'))).results[0]).toEqual({ questionId: 'q1', correct: true });
  });

  it('returns no next attempt time when there is no cooldown', async () => {
    const s = store({ getCourse: vi.fn().mockResolvedValue(course({ cooldownMinutes: 0 })) });
    expect((await grade(s)).nextAttemptAt).toBeNull();
  });

  it('rejects malformed requests', async () => {
    for (const bad of [
      { courseId: 1 },
      { parikshaId: '' },
      { questionIds: 'q1' },
      { answers: null },
      { answers: 'x' },
      { answers: [] },
      { answers: { q1: 'a' } },
    ]) {
      await rejects(grade(store(), bad), 'invalid-argument');
    }
  });

  it('rejects unknown courses and Parikshas', async () => {
    await rejects(grade(store({ getCourse: vi.fn().mockResolvedValue(undefined) })), 'not-found');
    await rejects(grade(store(), { parikshaId: 'nope' }), 'invalid-argument');
  });

  it('rejects a question list that is not the Pariksha’s', async () => {
    for (const bad of [
      { questionIds: ['q1', 'q1'], answers: {} },
      { questionIds: ['q1'], answers: {} },
      { questionIds: ['q1', 'q2', 'q3'], answers: {} },
      { questionIds: ['q1', 'zzz'], answers: {} },
      { answers: { q3: ['c'] } },
    ]) {
      await rejects(grade(store(), bad), 'invalid-argument');
    }
  });

  it('needs a progress document and respects the cooldown before reading the answer key', async () => {
    const none = store({ getProgress: vi.fn().mockResolvedValue(undefined) });
    await rejects(grade(none), 'failed-precondition');
    const prev = { best: 0.5, passed: false, attempts: 1, lastAttemptAt: ts(NOW - 1000) };
    const cooling = store({ getProgress: vi.fn().mockResolvedValue(progress(prev)) });
    await rejects(grade(cooling), 'resource-exhausted');
    expect(cooling.getAnswers).not.toHaveBeenCalled();
    expect(cooling.recordAttempt).not.toHaveBeenCalled();
  });

  it('fails when the key lacks a question', async () => {
    const s = store({ getAnswers: vi.fn().mockResolvedValue({ pk: { q1: ['a'] } }) });
    await rejects(grade(s), 'failed-precondition');
  });

  it('re-checks the cooldown inside the transaction', async () => {
    const recent = progress({ best: 1, passed: true, attempts: 1, lastAttemptAt: ts(NOW - 1000) });
    const s = store({
      recordAttempt: vi.fn(async (_a, decide: (p: unknown) => unknown) => ({
        attemptId: 'x',
        update: decide(recent),
      })),
    });
    await rejects(grade(s), 'resource-exhausted');
  });
});
