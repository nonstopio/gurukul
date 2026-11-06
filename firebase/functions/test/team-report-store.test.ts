import { describe, expect, it, vi } from 'vitest';
import {
  firebaseRoleAdmin,
  firestoreAssignStore,
  firestoreTeamReportStore,
} from '../src/stores.js';

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => 'NOW',
    increment: (n: number) => `${n > 0 ? '+' : ''}${n}`,
    arrayRemove: (v: string) => `remove:${v}`,
  },
  Timestamp: { fromMillis: (ms: number) => `ts:${ms}` },
}));

const ts = (ms: number) => ({ toMillis: () => ms });
const batchOf = () => ({
  set: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  commit: vi.fn().mockResolvedValue(undefined),
});
const teamSnap = (id: string, fields: Record<string, unknown>) => ({
  id,
  exists: true,
  get: (k: string) => fields[k],
});

describe('firebaseRoleAdmin.releaseManagedTeams', () => {
  const setup = (email: string | undefined, refs: string[]) => {
    const batch = batchOf();
    const get = vi.fn().mockResolvedValue({
      empty: refs.length === 0,
      size: refs.length,
      docs: refs.map((ref) => ({ ref })),
    });
    const limit = vi.fn().mockReturnValue({ get });
    const where = vi.fn().mockReturnValue({ limit });
    const db = {
      collection: vi.fn().mockReturnValue({ where }),
      batch: vi.fn().mockReturnValue(batch),
    } as never;
    const auth = { getUser: vi.fn().mockResolvedValue({ email }) } as never;
    return { admin: firebaseRoleAdmin(auth, db), batch, where, limit };
  };

  it('removes the lower-cased email from every team that lists it, in one batch', async () => {
    const { admin, batch, where, limit } = setup('Mona@NonStopIO.com', ['teams/a', 'teams/b']);
    expect(await admin.releaseManagedTeams('u')).toBe(2);
    expect(where).toHaveBeenCalledWith('managerEmails', 'array-contains', 'mona@nonstopio.com');
    expect(limit).toHaveBeenCalledWith(100);
    expect(batch.update).toHaveBeenCalledWith('teams/a', {
      managerEmails: 'remove:mona@nonstopio.com',
    });
    expect(batch.commit).toHaveBeenCalledOnce();
  });

  it('writes nothing when the person manages no team or has no email', async () => {
    const none = setup('mona@nonstopio.com', []);
    expect(await none.admin.releaseManagedTeams('u')).toBe(0);
    expect(none.batch.commit).not.toHaveBeenCalled();
    const noEmail = setup(undefined, ['teams/a']);
    expect(await noEmail.admin.releaseManagedTeams('u')).toBe(0);
    expect(noEmail.where).not.toHaveBeenCalled();
  });
});

describe('firestoreAssignStore.teams', () => {
  it('reads the teams that exist in one getAll, and nothing for no ids', async () => {
    const getAll = vi
      .fn()
      .mockResolvedValue([
        teamSnap('sales', { name: 'Sales', memberEmails: ['p@nonstopio.com'], managerEmails: [] }),
        { id: 'gone', exists: false },
      ]);
    const db = { doc: vi.fn((p: string) => p), getAll } as never;
    const store = firestoreAssignStore(db);
    const teams = await store.teams(['sales', 'gone']);
    expect([...teams.keys()]).toEqual(['sales']);
    expect(teams.get('sales')).toEqual({
      id: 'sales',
      name: 'Sales',
      memberEmails: ['p@nonstopio.com'],
      managerEmails: [],
    });
    expect((await store.teams([])).size).toBe(0);
    expect(getAll).toHaveBeenCalledOnce();
  });
});

describe('firestoreTeamReportStore', () => {
  const assignment = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    exists: true,
    data: () => ({
      email: 'p@nonstopio.com',
      uid: 'p',
      courseId: 'git',
      status: 'started',
      dueAt: ts(5),
      teamId: 'sales',
      ...over,
    }),
  });

  it('reads one team, or undefined', async () => {
    const getAll = vi
      .fn()
      .mockResolvedValueOnce([teamSnap('sales', { name: 'Sales' })])
      .mockResolvedValueOnce([{ id: 'x', exists: false }]);
    const store = firestoreTeamReportStore({ doc: vi.fn((p: string) => p), getAll } as never);
    expect(await store.team('sales')).toMatchObject({ id: 'sales', memberEmails: [] });
    expect(await store.team('x')).toBeUndefined();
  });

  it('reads one assignment as milliseconds, with missing fields as null', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce(assignment('a1'))
      .mockResolvedValueOnce(assignment('a2', { uid: undefined, dueAt: null, teamId: undefined }))
      .mockResolvedValueOnce({ exists: false });
    const store = firestoreTeamReportStore({ doc: vi.fn().mockReturnValue({ get }) } as never);
    expect(await store.assignment('a1')).toEqual({
      id: 'a1',
      email: 'p@nonstopio.com',
      uid: 'p',
      courseId: 'git',
      status: 'started',
      dueAt: 5,
      teamId: 'sales',
    });
    expect(await store.assignment('a2')).toMatchObject({ uid: null, dueAt: null, teamId: null });
    expect(await store.assignment('a3')).toBeUndefined();
  });

  it('queries assignments and profiles 30 emails at a time', async () => {
    const emails = Array.from({ length: 31 }, (_, i) => `u${i}@nonstopio.com`);
    const profile = (id: string, email: string, displayName: unknown) => ({
      id,
      get: (k: string) => ({ email, displayName })[k],
    });
    const get = vi
      .fn()
      .mockResolvedValueOnce({ docs: [assignment('a1')] })
      .mockResolvedValueOnce({ docs: [assignment('a2')] })
      .mockResolvedValueOnce({
        docs: [
          profile('u0', 'u0@nonstopio.com', 'Asha Rao'),
          profile('u1', 'u1@nonstopio.com', ''),
        ],
      })
      .mockResolvedValueOnce({ docs: [profile('u30', 'u30@nonstopio.com', undefined)] });
    const where = vi.fn().mockReturnValue({ get });
    const collection = vi.fn().mockReturnValue({ where });
    const store = firestoreTeamReportStore({ collection } as never);
    expect((await store.assignmentsFor(emails)).map((a) => a.id)).toEqual(['a1', 'a2']);
    const profiles = await store.profiles(emails);
    expect(collection).toHaveBeenCalledWith('assignments');
    expect(collection).toHaveBeenCalledWith('users');
    expect(where).toHaveBeenCalledTimes(4);
    expect(where).toHaveBeenCalledWith('email', 'in', emails.slice(0, 30));
    expect(profiles.get('u0@nonstopio.com')).toEqual({ uid: 'u0', displayName: 'Asha Rao' });
    expect(profiles.get('u1@nonstopio.com')).toEqual({ uid: 'u1', displayName: null });
    expect(profiles.get('u30@nonstopio.com')).toEqual({ uid: 'u30', displayName: null });
  });

  it('reads the percent of each progress document that has one', async () => {
    const getAll = vi.fn().mockResolvedValue([
      { id: 'p_git', exists: true, get: () => 40 },
      { id: 'p_sql', exists: true, get: () => undefined },
      { id: 'q_git', exists: false, get: () => 99 },
    ]);
    const store = firestoreTeamReportStore({ doc: vi.fn((p: string) => p), getAll } as never);
    const out = await store.percents([
      { uid: 'p', courseId: 'git' },
      { uid: 'p', courseId: 'sql' },
      { uid: 'q', courseId: 'git' },
    ]);
    expect(getAll).toHaveBeenCalledWith('progress/p_git', 'progress/p_sql', 'progress/q_git');
    expect([...out]).toEqual([['p_git', 40]]);
  });

  it('reads course titles', async () => {
    const getAll = vi.fn().mockResolvedValue([{ id: 'git', get: () => 'Git basics' }]);
    const store = firestoreTeamReportStore({ doc: vi.fn((p: string) => p), getAll } as never);
    expect(await store.courseTitles(['git'])).toEqual({ git: 'Git basics' });
  });

  it('sets or clears the due date and clears both notice stamps', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const doc = vi.fn().mockReturnValue({ update });
    const store = firestoreTeamReportStore({ doc } as never);
    await store.setDueAt('a1', 1000);
    await store.setDueAt('a1', null);
    expect(doc).toHaveBeenCalledWith('assignments/a1');
    expect(update).toHaveBeenNthCalledWith(1, {
      dueAt: 'ts:1000',
      dueSoonSentAt: null,
      overdueSentAt: null,
    });
    expect(update).toHaveBeenNthCalledWith(2, {
      dueAt: null,
      dueSoonSentAt: null,
      overdueSentAt: null,
    });
  });

  it('deletes an assignment and takes it off the counters in one batch, and audits', async () => {
    const batch = batchOf();
    const add = vi.fn().mockResolvedValue(undefined);
    const db = {
      doc: vi.fn((p: string) => p),
      batch: vi.fn().mockReturnValue(batch),
      collection: vi.fn().mockReturnValue({ add }),
    } as never;
    const store = firestoreTeamReportStore(db);
    await store.deleteAssignment({
      id: 'a1',
      email: 'p@nonstopio.com',
      uid: null,
      courseId: 'git',
      status: 'assigned',
      dueAt: null,
      teamId: null,
    });
    expect(batch.delete).toHaveBeenCalledWith('assignments/a1');
    expect(batch.set).toHaveBeenCalledWith('stats/course_git', { assigned: '-1' }, { merge: true });
    expect(batch.set).toHaveBeenCalledWith(
      'stats/org',
      { assignmentsTotal: '-1' },
      { merge: true },
    );
    expect(batch.commit).toHaveBeenCalledOnce();
    await store.audit({ action: 'assign.remove', by: 'k', detail: {} });
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ at: 'NOW' }));
  });
});
