import { describe, expect, it, vi } from 'vitest';
import {
  handleAssignCourses,
  handleRemindLearners,
  handleResetCooldown,
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
        code: 'AUTH_1001',
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
          code: 'AUTH_1002',
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

  it('lets grading failures surface as ApiExceptions and rethrows others', async () => {
    await expect(handleCheckAnswer(learner({ data: undefined }), store())).rejects.toMatchObject({
      code: 'VAL_1001',
    });
    await expect(handleCheckAnswer(learner({ data: 'x' }), store())).rejects.toMatchObject({
      code: 'VAL_1001',
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
      code: 'PRK_4001',
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
      code: 'AUTH_1001',
    });
    await expect(
      handleRevokeCertificate(
        { ...kulapati, auth: { uid: 'x', token: { email: 'x@nonstopio.com' } } },
        admin(),
      ),
    ).rejects.toMatchObject({ code: 'AUTH_2001' });
    await expect(
      handleRevokeCertificate({ ...kulapati, data: undefined }, admin()),
    ).rejects.toMatchObject({
      code: 'VAL_1001',
    });
    const broken = { ...admin(), setRevoked: vi.fn().mockRejectedValue(new Error('boom')) };
    await expect(handleRevokeCertificate(kulapati, broken)).rejects.toThrow('boom');
  });
});

describe('console callables', () => {
  const asKulapati = (data: unknown): AuthedRequest => ({
    auth: { uid: 'k', token: { email: 'k@nonstopio.com', kulapati: true } },
    data,
  });
  const noAuth: AuthedRequest = { data: {} };
  const learnerReq: AuthedRequest = {
    auth: { uid: 'u', token: { email: 'u@nonstopio.com' } },
    data: { uid: 'u', courseId: 'git', parikshaId: 'pk', courseIds: ['git'] },
  };

  it('assignCourses signs the caller in, maps a refusal to its code and returns the result', async () => {
    const mailer = { send: vi.fn().mockResolvedValue(undefined) };
    const assignStore = {
      courses: vi.fn().mockResolvedValue({ git: { status: 'published', title: 'Git' } }),
      signedInUsers: vi.fn().mockResolvedValue(new Map()),
      existingAssignmentIds: vi.fn().mockResolvedValue(new Set()),
      createAssignments: vi.fn().mockResolvedValue(undefined),
      bumpAssigned: vi.fn().mockResolvedValue(undefined),
      audit: vi.fn().mockResolvedValue(undefined),
    };
    const deps = { store: assignStore, mailer };
    const ok = await handleAssignCourses(
      asKulapati({
        courseIds: ['git'],
        emails: ['a@nonstopio.com'],
        dueAt: null,
        mandatory: false,
        reminder: 'none',
        notify: true,
      }),
      deps,
    );
    expect(ok).toMatchObject({ assigned: 1, notified: 1 });
    await expect(handleAssignCourses(noAuth, deps)).rejects.toMatchObject({
      code: 'AUTH_1001',
    });
    await expect(handleAssignCourses(learnerReq, deps)).rejects.toMatchObject({
      code: 'AUTH_2001',
    });
    await expect(handleAssignCourses(asKulapati(undefined), deps)).rejects.toMatchObject({
      code: 'VAL_1001',
    });
    assignStore.courses.mockRejectedValueOnce(new Error('boom'));
    await expect(
      handleAssignCourses(
        asKulapati({
          courseIds: ['git'],
          emails: ['a@nonstopio.com'],
          dueAt: null,
          mandatory: false,
          reminder: 'none',
          notify: false,
        }),
        deps,
      ),
    ).rejects.toThrow('boom');
  });

  it('resetCooldown maps its errors', async () => {
    const admin = {
      resetCooldown: vi.fn().mockResolvedValue(true),
      audit: vi.fn().mockResolvedValue(undefined),
    };
    expect(
      await handleResetCooldown(asKulapati({ uid: 'u', courseId: 'git', parikshaId: 'pk' }), admin),
    ).toEqual({ ok: true });
    await expect(handleResetCooldown(noAuth, admin)).rejects.toMatchObject({
      code: 'AUTH_1001',
    });
    await expect(handleResetCooldown(learnerReq, admin)).rejects.toMatchObject({
      code: 'AUTH_2001',
    });
    admin.resetCooldown.mockResolvedValueOnce(false);
    await expect(handleResetCooldown(asKulapati(learnerReq.data), admin)).rejects.toMatchObject({
      code: 'PRK_2001',
    });
  });

  it('remindLearners uses the clock and maps its errors', async () => {
    const store = {
      forCourse: vi.fn().mockResolvedValue([]),
      forEmails: vi.fn(),
      scheduled: vi.fn(),
      courseTitles: vi.fn(),
      markReminded: vi.fn(),
      remindersEnabled: vi.fn(),
      audit: vi.fn().mockResolvedValue(undefined),
    };
    const deps = { store, mailer: { send: vi.fn() } };
    expect(await handleRemindLearners(asKulapati({ courseId: 'git' }), deps, () => 5)).toEqual({
      sent: 0,
      skipped: 0,
    });
    await expect(handleRemindLearners(noAuth, deps, () => 5)).rejects.toMatchObject({
      code: 'AUTH_1001',
    });
    await expect(handleRemindLearners(learnerReq, deps, () => 5)).rejects.toMatchObject({
      code: 'AUTH_2001',
    });
  });
});
