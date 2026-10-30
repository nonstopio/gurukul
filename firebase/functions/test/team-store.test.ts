import { describe, expect, it, vi } from 'vitest';
import { firestoreTeamStore, firestoreUserStore } from '../src/stores.js';

vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'NOW' } }));

/** `profiles` maps an email to its profile ref; the transaction reads `teams`. */
function dbWith(profiles: Record<string, string>, teams: string[]) {
  const update = vi.fn();
  const tx = { get: vi.fn(async () => ({ docs: teams.map((id) => ({ id })) })), update };
  const db = {
    collection: () => ({
      where: (_field: string, _op: string, email: string) => ({
        limit: () => ({
          get: async () => ({ docs: profiles[email] ? [{ ref: profiles[email] }] : [] }),
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

  it('reconciles a new profile, and skips an email with no profile', async () => {
    const some = dbWith({ 'a@x.com': 'ref:a' }, []);
    await firestoreUserStore(some.db).reconcileTeams('a@x.com');
    expect(some.update).toHaveBeenCalledWith('ref:a', { teamIds: [] });
    const none = dbWith({}, ['qa']);
    await firestoreUserStore(none.db).reconcileTeams('a@x.com');
    expect(none.update).not.toHaveBeenCalled();
  });
});
