import { describe, expect, it, vi } from 'vitest';
import { firebaseRoleAdmin, firestoreUserStore } from '../src/stores.js';

vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'NOW' } }));

function fakeDb(docs: { ref: string }[] = []) {
  const set = vi.fn().mockResolvedValue(undefined);
  const add = vi.fn().mockResolvedValue(undefined);
  const update = vi.fn();
  const commit = vi.fn().mockResolvedValue(undefined);
  const where2 = {
    get: vi.fn().mockResolvedValue({ empty: docs.length === 0, docs, size: docs.length }),
  };
  const where = vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue(where2) });
  const db = {
    doc: vi.fn().mockReturnValue({ set }),
    collection: vi.fn().mockReturnValue({ where, add }),
    batch: vi.fn().mockReturnValue({ update, commit }),
  };
  return { db: db as never, set, add, update, commit, where };
}

describe('firestoreUserStore', () => {
  it('creates the profile with a server timestamp', async () => {
    const f = fakeDb();
    await firestoreUserStore(f.db).createProfile('u', { email: 'a' } as never);
    expect(f.set).toHaveBeenCalledWith({ email: 'a', createdAt: 'NOW' }, { merge: true });
  });

  it('stamps the uid on every unclaimed assignment in one batch', async () => {
    const f = fakeDb([{ ref: 'r1' }, { ref: 'r2' }]);
    expect(await firestoreUserStore(f.db).claimAssignments('a@nonstopio.com', 'u')).toBe(2);
    expect(f.where).toHaveBeenCalledWith('email', '==', 'a@nonstopio.com');
    expect(f.update).toHaveBeenCalledWith('r1', { uid: 'u' });
    expect(f.update).toHaveBeenCalledWith('r2', { uid: 'u' });
    expect(f.commit).toHaveBeenCalledOnce();
  });

  it('does not open a batch when there is nothing to claim', async () => {
    const f = fakeDb();
    expect(await firestoreUserStore(f.db).claimAssignments('a@nonstopio.com', 'u')).toBe(0);
    expect(f.commit).not.toHaveBeenCalled();
  });
});

describe('firebaseRoleAdmin', () => {
  it('talks to Auth and Firestore', async () => {
    const auth = {
      getUser: vi.fn().mockResolvedValue({ customClaims: { acharya: true } }),
      setCustomUserClaims: vi.fn().mockResolvedValue(undefined),
      revokeRefreshTokens: vi.fn().mockResolvedValue(undefined),
    };
    const f = fakeDb();
    const admin = firebaseRoleAdmin(auth as never, f.db);
    expect(await admin.getClaims('u')).toEqual({ acharya: true });
    await admin.setClaims('u', { kulapati: true });
    await admin.revokeTokens('u');
    await admin.mirrorRoles('u', {
      claims: { acharya: false, kulapati: true },
      roles: ['shishya', 'kulapati'],
    });
    await admin.audit({
      action: 'a',
      by: 'b',
      target: 'c',
      detail: { acharya: false, kulapati: true },
    });
    expect(auth.setCustomUserClaims).toHaveBeenCalledWith('u', { kulapati: true });
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith('u');
    expect(f.set).toHaveBeenCalledWith({ roles: ['shishya', 'kulapati'] }, { merge: true });
    expect(f.add).toHaveBeenCalledWith(expect.objectContaining({ action: 'a', at: 'NOW' }));
  });
});
