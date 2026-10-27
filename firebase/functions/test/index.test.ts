import type * as Handlers from '../src/handlers.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const captured: {
  onCreate?: (u: unknown) => unknown;
  onWritten?: (e: unknown) => unknown;
} = {};
const handleUserCreated = vi.fn().mockResolvedValue(undefined);
const handleSetRoles = vi.fn();
const handleCheckAnswer = vi.fn();
const handleGradeAttempt = vi.fn();
const handleRevokeCertificate = vi.fn();
const handleProgressWrite = vi.fn().mockResolvedValue('updated');

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/auth', () => ({ getAuth: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: vi.fn(), FieldValue: {} }));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (_path: string, fn: (e: unknown) => unknown) => {
    captured.onWritten = fn;
    return fn;
  },
}));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class extends Error {
    constructor(
      readonly code: string,
      message: string,
      readonly details?: unknown,
    ) {
      super(message);
    }
  },
  onCall: (fn: (r: unknown) => unknown) => {
    return fn;
  },
}));
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
vi.mock('../src/handlers.js', async (orig) => ({
  ...(await orig<typeof Handlers>()),
  handleSetRoles,
  handleCheckAnswer,
  handleGradeAttempt,
  handleRevokeCertificate,
}));

beforeEach(() => vi.clearAllMocks());

describe('index', () => {
  it('wires onUserCreated to the profile handler', async () => {
    await import('../src/index.js');
    await captured.onCreate?.({ uid: 'u' });
    expect(handleUserCreated).toHaveBeenCalledWith(expect.anything(), { uid: 'u' });
  });

  it('wires setRoles, mapping a CallError to an HttpsError and rethrowing others', async () => {
    const { CallError } = await import('../src/handlers.js');
    const { setRoles } = await import('../src/index.js');
    const call = setRoles as unknown as (r: unknown) => Promise<unknown>;
    handleSetRoles.mockResolvedValueOnce({ roles: ['shishya'] });
    expect(await call({})).toEqual({ roles: ['shishya'] });
    handleSetRoles.mockRejectedValueOnce(new CallError('permission-denied', 'no'));
    await expect(call({})).rejects.toMatchObject({
      code: 'permission-denied',
      message: 'no',
    });
    handleSetRoles.mockRejectedValueOnce(new Error('boom'));
    await expect(call({})).rejects.toThrow('boom');
  });

  it('wires the progress trigger with the before and after data, tolerating a missing snapshot', async () => {
    await import('../src/index.js');
    await captured.onWritten?.({
      params: { progressId: 'u_git' },
      data: { before: { data: () => undefined }, after: { data: () => ({ a: 1 }) } },
    });
    expect(handleProgressWrite).toHaveBeenCalledWith(expect.anything(), 'u_git', undefined, {
      a: 1,
    });
    await captured.onWritten?.({ params: { progressId: 'u_git' }, data: undefined });
    expect(handleProgressWrite).toHaveBeenLastCalledWith(
      expect.anything(),
      'u_git',
      undefined,
      undefined,
    );
  });

  it('wires checkAnswer, gradeAttempt and revokeCertificate with the same error mapping', async () => {
    const { CallError } = await import('../src/handlers.js');
    const mod = await import('../src/index.js');
    const wired = [
      [mod.checkAnswer, handleCheckAnswer],
      [mod.gradeAttempt, handleGradeAttempt],
      [mod.revokeCertificate, handleRevokeCertificate],
    ] as const;
    for (const [fn, handler] of wired) {
      const call = fn as unknown as (r: unknown) => Promise<unknown>;
      handler.mockResolvedValueOnce({ ok: 1 });
      expect(await call({})).toEqual({ ok: 1 });
      handler.mockRejectedValueOnce(
        new CallError('resource-exhausted', 'wait', { nextAttemptAt: 7 }),
      );
      await expect(call({})).rejects.toMatchObject({
        code: 'resource-exhausted',
        message: 'wait',
        details: { nextAttemptAt: 7 },
      });
      handler.mockRejectedValueOnce(new Error('boom'));
      await expect(call({})).rejects.toThrow('boom');
    }
    expect(handleGradeAttempt).toHaveBeenCalledWith({}, expect.anything(), Date.now);
  });
});
