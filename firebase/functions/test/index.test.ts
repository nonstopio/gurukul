import type * as Handlers from '../src/handlers.js';
import * as logger from 'firebase-functions/logger';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const captured: {
  onCreate?: (u: unknown) => unknown;
  onWritten?: (e: unknown) => unknown;
  onAttempt?: (e: unknown) => unknown;
  schedules: Record<string, { options: unknown; fn: () => unknown }>;
} = { schedules: {} };
const handleUserCreated = vi.fn().mockResolvedValue({ created: true, claimed: 2 });
const handleSetRoles = vi.fn();
const handleCheckAnswer = vi.fn();
const handleGradeAttempt = vi.fn();
const handleRevokeCertificate = vi.fn();
const handleProgressWrite = vi.fn().mockResolvedValue('updated');
const handleAssignCourses = vi.fn();
const handleResetCooldown = vi.fn();
const handleRemindLearners = vi.fn();
const handleAttemptCreated = vi.fn().mockResolvedValue('counted');
const runDailyRollup = vi.fn().mockResolvedValue({});
const runDailyReminders = vi.fn().mockResolvedValue({});

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/auth', () => ({ getAuth: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: vi.fn(), FieldValue: {} }));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (options: { schedule: string }, fn: () => unknown) => {
    captured.schedules[options.schedule] = { options, fn };
    return fn;
  },
}));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentCreated: (_path: string, fn: (e: unknown) => unknown) => {
    captured.onAttempt = fn;
    return fn;
  },
  onDocumentWritten: (_path: string, fn: (e: unknown) => unknown) => {
    captured.onWritten = fn;
    return fn;
  },
}));
const created: unknown[] = [];
const apiCallable = vi.fn((handler: (r: unknown) => unknown) => {
  created.push(handler);
  return handler;
});
vi.mock('../src/api/callable.js', () => ({ apiCallable }));
vi.mock('firebase-functions/v1', () => ({
  region: () => ({
    auth: {
      user: () => ({
        onCreate: (fn: (u: unknown) => unknown) => {
          captured.onCreate = fn;
          return fn;
        },
      }),
    },
  }),
}));
vi.mock('../src/profile.js', () => ({ handleUserCreated }));
vi.mock('../src/progress.js', () => ({ handleProgressWrite }));
vi.mock('../src/analytics.js', () => ({ handleAttemptCreated, runDailyRollup }));
vi.mock('../src/remind.js', () => ({ runDailyReminders }));
vi.mock('../src/handlers.js', async (orig) => ({
  ...(await orig<typeof Handlers>()),
  handleSetRoles,
  handleCheckAnswer,
  handleGradeAttempt,
  handleRevokeCertificate,
  handleAssignCourses,
  handleResetCooldown,
  handleRemindLearners,
}));

beforeEach(() => vi.clearAllMocks());

describe('index', () => {
  it('wires onUserCreated to the profile handler', async () => {
    await import('../src/index.js');
    await captured.onCreate?.({ uid: 'u' });
    expect(handleUserCreated).toHaveBeenCalledWith(expect.anything(), { uid: 'u' });
  });

  it('wires the progress trigger with the before and after data, tolerating a missing snapshot', async () => {
    await import('../src/index.js');
    await captured.onWritten?.({
      params: { progressId: 'u_git' },
      data: { before: { data: () => undefined }, after: { data: () => ({ a: 1 }) } },
    });
    expect(handleProgressWrite).toHaveBeenCalledWith(
      expect.anything(),
      'u_git',
      undefined,
      { a: 1 },
      expect.any(Date),
    );
    await captured.onWritten?.({ params: { progressId: 'u_git' }, data: undefined });
    expect(handleProgressWrite).toHaveBeenLastCalledWith(
      expect.anything(),
      'u_git',
      undefined,
      undefined,
      expect.any(Date),
    );
  });

  it('wires the attempt trigger, tolerating a missing snapshot', async () => {
    await import('../src/index.js');
    await captured.onAttempt?.({
      params: { attemptId: 'a1' },
      data: { data: () => ({ score: 1 }) },
    });
    expect(handleAttemptCreated).toHaveBeenCalledWith(expect.anything(), { score: 1 });
    await captured.onAttempt?.({ params: { attemptId: 'a1' }, data: undefined });
    expect(handleAttemptCreated).toHaveBeenLastCalledWith(expect.anything(), undefined);
  });

  it('schedules the roll-up and the reminders once a day, in UTC and in asia-south1', async () => {
    await import('../src/index.js');
    const rollup = captured.schedules['every day 03:00'];
    const reminders = captured.schedules['every day 04:00'];
    for (const s of [rollup, reminders]) {
      expect(s?.options).toMatchObject({ timeZone: 'Etc/UTC', region: 'asia-south1' });
    }
    await rollup?.fn();
    expect(runDailyRollup).toHaveBeenCalledWith(expect.anything(), expect.any(Number));
    await reminders?.fn();
    expect(runDailyReminders).toHaveBeenCalledWith(
      { store: expect.anything(), mailer: expect.anything() },
      expect.any(Number),
    );
  });

  it('logs one summary per trigger run: info when something changed, debug when not', async () => {
    vi.stubEnv('LOG_LEVEL', 'debug');
    await import('../src/index.js');
    const event = { params: { progressId: 'u_git' }, data: undefined };
    await captured.onWritten?.(event);
    expect(logger.info).toHaveBeenCalledWith(
      'Progress write handled',
      expect.objectContaining({
        progressId: 'u_git',
        outcome: 'updated',
        durationMs: expect.any(Number),
      }),
    );
    handleProgressWrite.mockResolvedValueOnce('unchanged');
    await captured.onWritten?.(event);
    expect(logger.debug).toHaveBeenCalledWith(
      'Progress write handled',
      expect.objectContaining({ outcome: 'unchanged' }),
    );
    await captured.onCreate?.({ uid: 'u' });
    expect(logger.info).toHaveBeenCalledWith(
      'Sign-up handled',
      expect.objectContaining({ uid: 'u', created: true, count: 2 }),
    );
    runDailyReminders.mockResolvedValueOnce({ sent: 3, skipped: 1 });
    await captured.schedules['every day 04:00']?.fn();
    expect(logger.info).toHaveBeenCalledWith(
      'Daily reminders finished',
      expect.objectContaining({ count: 3, skipped: 1 }),
    );
    runDailyRollup.mockResolvedValueOnce({ usersTotal: 9 });
    await captured.schedules['every day 03:00']?.fn();
    expect(logger.info).toHaveBeenCalledWith(
      'Daily roll-up finished',
      expect.objectContaining({ usersTotal: 9 }),
    );
    vi.unstubAllEnvs();
  });

  it('logs a failing trigger once, with the error, and rethrows it', async () => {
    await import('../src/index.js');
    handleAttemptCreated.mockRejectedValueOnce(new Error('boom'));
    await expect(
      captured.onAttempt?.({ params: { attemptId: 'a1' }, data: undefined }),
    ).rejects.toThrow('boom');
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      'Attempt counting failed',
      expect.objectContaining({
        attemptId: 'a1',
        err: expect.objectContaining({ message: 'boom' }),
      }),
    );
  });

  it('creates every callable through apiCallable, and only those', async () => {
    const mod = await import('../src/index.js');
    const callables = [
      'setRoles',
      'checkAnswer',
      'gradeAttempt',
      'revokeCertificate',
      'assignCourses',
      'resetCooldown',
      'remindLearners',
    ] as const;
    expect(created).toHaveLength(callables.length);
    for (const name of callables) expect(created).toContain(mod[name]);
  });

  it('wires each callable to its handler with the request', async () => {
    const mod = await import('../src/index.js');
    const wired = [
      [mod.setRoles, handleSetRoles, []],
      [mod.checkAnswer, handleCheckAnswer, []],
      [mod.gradeAttempt, handleGradeAttempt, [Date.now]],
      [mod.revokeCertificate, handleRevokeCertificate, []],
      [mod.assignCourses, handleAssignCourses, []],
      [mod.resetCooldown, handleResetCooldown, []],
      [mod.remindLearners, handleRemindLearners, [Date.now]],
    ] as const;
    for (const [fn, handler, extra] of wired) {
      const call = fn as unknown as (r: unknown) => Promise<unknown>;
      handler.mockResolvedValueOnce({ ok: 1 });
      expect(await call({ data: 1 })).toEqual({ ok: 1 });
      expect(handler).toHaveBeenCalledWith({ data: 1 }, expect.anything(), ...extra);
    }
  });
});
