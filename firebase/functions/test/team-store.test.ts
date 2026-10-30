import { describe, expect, it, vi } from 'vitest';
import { firestoreTeamStore, firestoreUserStore } from '../src/stores.js';

vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'NOW' } }));

/** `profiles` maps an email to its profile ref; the transaction reads `teams`. */
function dbWith(profiles: Record<string, string | string[]>, teams: string[]) {
  const update = vi.fn();
  const tx = { get: vi.fn(async () => ({ docs: teams.map((id) => ({ id })) })), update };
  const db = {
    collection: () => ({
      where: (_field: string, _op: string, email: string) => ({
        limit: () => ({
          get: async () => ({ docs: [profiles[email] ?? []].flat().map((ref) => ({ ref })) }),
        }),
      }),
    }),
    runTransaction: (fn: (t: typeof tx) => unknown) => fn(tx),
  } as never;
  return { db, tx, update };
}

describe('team membership on profiles', () => {
  it('sets a profile’s team ids from the teams that list it, inside one transaction', async () => {
    const { db, update, tx } = dbWith({ 'a@x.com': 'ref:a' }, ['platform', 'qa']);
    expect(await firestoreTeamStore(db).reconcile(['a@x.com', 'ghost@x.com'])).toBe(1);
    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith('ref:a', { teamIds: ['platform', 'qa'] });
    expect(tx.get).toHaveBeenCalledOnce();
  });

  it('updates every profile that shares an email, so none keeps a revoked team', async () => {
    const { db, update } = dbWith({ 'a@x.com': ['ref:old', 'ref:new'] }, ['qa']);
    expect(await firestoreTeamStore(db).reconcile(['a@x.com'])).toBe(1);
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith('ref:old', { teamIds: ['qa'] });
    expect(update).toHaveBeenCalledWith('ref:new', { teamIds: ['qa'] });
  });

  it('reconciles a new profile, and skips an email with no profile', async () => {
    const some = dbWith({ 'a@x.com': 'ref:a' }, []);
    await firestoreUserStore(some.db).reconcileTeams('a@x.com');
    expect(some.update).toHaveBeenCalledWith('ref:a', { teamIds: [] });
    const none = dbWith({}, ['qa']);
    await firestoreUserStore(none.db).reconcileTeams('a@x.com');
    expect(none.update).not.toHaveBeenCalled();
  });
});
