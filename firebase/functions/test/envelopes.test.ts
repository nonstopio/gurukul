import { ApiException, apiResponseSchema } from '@gurukul/schema';
import type * as Handlers from '../src/handlers.js';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// The real `apiCallable` and the real index wiring; only the Firebase SDK edges are replaced.
vi.mock('@google-cloud/firestore', () => ({ default: { v1: { FirestoreAdminClient: vi.fn() } } }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/auth', () => ({ getAuth: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: vi.fn(), FieldValue: {} }));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_o: unknown, fn: unknown) => fn,
}));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentCreated: (_p: string, fn: unknown) => fn,
  onDocumentWritten: (_p: string, fn: unknown) => fn,
}));
vi.mock('firebase-functions/v1', () => ({
  region: () => ({
    runWith: () => ({ auth: { user: () => ({ onCreate: (fn: unknown) => fn }) } }),
  }),
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
  onCall: (fn: unknown) => fn,
}));

const handlers = vi.hoisted(() => ({
  setRoles: vi.fn(),
  checkAnswer: vi.fn(),
  gradeAttempt: vi.fn(),
  revokeCertificate: vi.fn(),
  assignCourses: vi.fn(),
  resetCooldown: vi.fn(),
  remindLearners: vi.fn(),
}));
vi.mock('../src/handlers.js', async (orig) => ({
  ...(await orig<typeof Handlers>()),
  handleSetRoles: handlers.setRoles,
  handleCheckAnswer: handlers.checkAnswer,
  handleGradeAttempt: handlers.gradeAttempt,
  handleRevokeCertificate: handlers.revokeCertificate,
  handleAssignCourses: handlers.assignCourses,
  handleResetCooldown: handlers.resetCooldown,
  handleRemindLearners: handlers.remindLearners,
}));

const index = await import('../src/index.js');

type Call = (request: unknown) => Promise<unknown>;
const envelope = apiResponseSchema(z.unknown());

const callables = [
  ['setRoles', index.setRoles, handlers.setRoles, { roles: ['acharya'] }],
  ['checkAnswer', index.checkAnswer, handlers.checkAnswer, { correct: true }],
  ['gradeAttempt', index.gradeAttempt, handlers.gradeAttempt, { score: 1 }],
  ['revokeCertificate', index.revokeCertificate, handlers.revokeCertificate, { revoked: true }],
  ['assignCourses', index.assignCourses, handlers.assignCourses, { assigned: 1 }],
  ['resetCooldown', index.resetCooldown, handlers.resetCooldown, { reset: true }],
  ['remindLearners', index.remindLearners, handlers.remindLearners, { queued: 2 }],
] as const;

describe.each(callables)('%s envelope', (_name, callable, handler, data) => {
  const run = callable as unknown as Call;

  it('returns a success body that parses with apiResponseSchema', async () => {
    handler.mockResolvedValueOnce(data);
    const parsed = envelope.parse(await run({}));
    expect(parsed).toMatchObject({ success: true, status: 200, data, errors: [] });
  });

  it('throws a failure whose details parse with apiResponseSchema', async () => {
    handler.mockRejectedValueOnce(new ApiException('AUTH_1001'));
    const thrown = await run({}).then(
      () => expect.unreachable('should have thrown'),
      (e: { details: unknown }) => e,
    );
    const parsed = envelope.parse(thrown.details);
    expect(parsed).toMatchObject({ success: false, data: null });
    expect(parsed.errors[0]?.code).toBe('AUTH_1001');
    expect(parsed.status).toBeGreaterThanOrEqual(400);
  });

  it('turns an unexpected error into GEN_5000 without leaking its text', async () => {
    handler.mockRejectedValueOnce(new Error('secret stack detail'));
    const thrown = await run({}).then(
      () => expect.unreachable('should have thrown'),
      (e: { details: unknown }) => e,
    );
    expect(envelope.parse(thrown.details).errors[0]?.code).toBe('GEN_5000');
    expect(JSON.stringify(thrown.details)).not.toContain('secret stack detail');
  });
});
