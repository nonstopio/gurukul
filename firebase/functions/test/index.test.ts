import type * as Handlers from '../src/handlers.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const captured: { onCall?: (r: unknown) => unknown; onCreate?: (u: unknown) => unknown } = {};
const handleUserCreated = vi.fn().mockResolvedValue(undefined);
const handleSetRoles = vi.fn();

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/auth', () => ({ getAuth: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: vi.fn(), FieldValue: {} }));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
  onCall: (fn: (r: unknown) => unknown) => {
    captured.onCall = fn;
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
vi.mock('../src/handlers.js', async (orig) => ({
  ...(await orig<typeof Handlers>()),
  handleSetRoles,
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
    await import('../src/index.js');
    handleSetRoles.mockResolvedValueOnce({ roles: ['shishya'] });
    expect(await captured.onCall?.({})).toEqual({ roles: ['shishya'] });
    handleSetRoles.mockRejectedValueOnce(new CallError('permission-denied', 'no'));
    await expect(captured.onCall?.({})).rejects.toMatchObject({
      code: 'permission-denied',
      message: 'no',
    });
    handleSetRoles.mockRejectedValueOnce(new Error('boom'));
    await expect(captured.onCall?.({})).rejects.toThrow('boom');
  });
});
