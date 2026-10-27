import { describe, expect, it, vi } from 'vitest';
import {
  CallError,
  handleCheckAnswer,
  handleGradeAttempt,
  handleRevokeCertificate,
} from '../src/handlers.js';
import type { AuthedRequest } from '../src/handlers.js';
import type { GradingStore } from '../src/grading.js';
import { answerKey, course, progress, ts } from './fixtures.js';

const learner = (over: object = {}): AuthedRequest => ({
  auth: {
    uid: 'u',
    token: {
      email: 'u@nonstopio.com',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    },
  },
  data: {},
  ...over,
});
const store = (over: object = {}): GradingStore => ({
  getCourse: vi.fn().mockResolvedValue(course()),
  getAnswers: vi.fn().mockResolvedValue(answerKey),
  getProgress: vi.fn().mockResolvedValue(progress()),
  recordAttempt: vi.fn().mockResolvedValue({
    attemptId: 'a1',
    update: { best: 1, passed: true, attempts: 1 },
  }),
  ...over,
});
const check = { courseId: 'git-basics', parikshaId: 'pk', questionId: 'q1', selected: ['a'] };

describe('learner callables sign-in check', () => {
  const calls = [
    (r: AuthedRequest) => handleCheckAnswer(r, store()),
    (r: AuthedRequest) => handleGradeAttempt(r, store(), () => 0),
  ];
  it.each(calls.map((c, i) => [i, c] as const))(
    'callable %i needs a NonStop Google sign-in',
    async (_i, call) => {
      await expect(call(learner({ auth: undefined }))).rejects.toMatchObject({
        code: 'unauthenticated',
      });
      const tokens = [
        {
          email: 'u@gmail.com',
          email_verified: true,
          firebase: { sign_in_provider: 'google.com' },
        },
        {
          email: 'u@nonstopio.com',
          email_verified: false,
          firebase: { sign_in_provider: 'google.com' },
        },
        {
          email: 'u@nonstopio.com',
          email_verified: true,
          firebase: { sign_in_provider: 'password' },
        },
        { email: 'u@nonstopio.com', email_verified: true },
      ];
      for (const token of tokens) {
        await expect(call(learner({ auth: { uid: 'u', token } }))).rejects.toMatchObject({
          code: 'permission-denied',
        });
      }
    },
  );
});

describe('handleCheckAnswer', () => {
  it('answers for a signed-in learner', async () => {
    expect(await handleCheckAnswer(learner({ data: check }), store())).toMatchObject({
      correct: true,
    });
  });

  it('maps grading errors to call errors and rethrows others', async () => {
    await expect(handleCheckAnswer(learner({ data: undefined }), store())).rejects.toBeInstanceOf(
      CallError,
    );
    await expect(handleCheckAnswer(learner({ data: 'x' }), store())).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    const boom = store({ getCourse: vi.fn().mockRejectedValue(new Error('boom')) });
    await expect(handleCheckAnswer(learner({ data: check }), boom)).rejects.toThrow('boom');
  });
});

describe('handleGradeAttempt', () => {
  const data = {
    courseId: 'git-basics',
    parikshaId: 'pk',
    questionIds: ['q1', 'q2'],
    answers: { q1: ['a'] },
  };

  it('grades with the caller’s uid and the clock', async () => {
    const s = store();
    const out = await handleGradeAttempt(learner({ data }), s, () => 5);
    expect(out).toMatchObject({ attemptId: 'a1', nextAttemptAt: 5 + 600_000 });
    expect(s.recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'u' }),
      expect.any(Function),
    );
  });

  it('carries nextAttemptAt in the error details when cooling down', async () => {
    const prev = { best: 0.5, passed: false, attempts: 1, lastAttemptAt: ts(1000) };
    const s = store({ getProgress: vi.fn().mockResolvedValue(progress(prev)) });
    await expect(handleGradeAttempt(learner({ data }), s, () => 2000)).rejects.toMatchObject({
      code: 'resource-exhausted',
      details: { nextAttemptAt: 1000 + 600_000 },
    });
  });
});

describe('handleRevokeCertificate', () => {
  const admin = () => ({
    setRevoked: vi.fn().mockResolvedValue(true),
    audit: vi.fn().mockResolvedValue(undefined),
  });
  const kulapati = {
    auth: { uid: 'k', token: { email: 'k@nonstopio.com', kulapati: true } },
    data: { id: 'NSG-GIT-26-0001' },
  };

  it('revokes for a Kulapati', async () => {
    expect(await handleRevokeCertificate(kulapati, admin())).toEqual({
      id: 'NSG-GIT-26-0001',
      revoked: true,
    });
  });

  it('needs sign-in, maps domain errors and rethrows others', async () => {
    await expect(handleRevokeCertificate({}, admin())).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    await expect(
      handleRevokeCertificate(
        { ...kulapati, auth: { uid: 'x', token: { email: 'x@nonstopio.com' } } },
        admin(),
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      handleRevokeCertificate({ ...kulapati, data: undefined }, admin()),
    ).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    const broken = { ...admin(), setRevoked: vi.fn().mockRejectedValue(new Error('boom')) };
    await expect(handleRevokeCertificate(kulapati, broken)).rejects.toThrow('boom');
  });
});
