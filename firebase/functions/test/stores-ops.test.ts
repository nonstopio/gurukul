import { describe, expect, it, vi } from 'vitest';
import {
  firebaseRoleAdmin,
  firestoreBackupPort,
  firestoreAssignStore,
  firestoreAttemptStatsStore,
  firestoreCooldownAdmin,
  firestoreCourseStore,
  firestoreMailer,
  firestoreReminderStore,
  firestoreRollupStore,
} from '../src/stores.js';

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => 'NOW',
    increment: (n: number) => `+${n}`,
    arrayUnion: (v: string) => `union:${v}`,
    arrayRemove: (v: string) => `remove:${v}`,
  },
  Timestamp: { fromMillis: (ms: number) => `ts:${ms}` },
  FieldPath: class {
    parts: string[];
    constructor(...parts: string[]) {
      this.parts = parts;
    }
  },
}));

const ts = (ms: number) => ({ toMillis: () => ms });
const batchOf = () => ({
  set: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  commit: vi.fn().mockResolvedValue(undefined),
});

describe('firebaseRoleAdmin course grants', () => {
  it('reads the granted ids, with an empty list for a profile without any', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ get: () => ['git'] })
      .mockResolvedValueOnce({ get: () => undefined });
    const db = { doc: vi.fn().mockReturnValue({ get }) } as never;
    const admin = firebaseRoleAdmin({} as never, db);
    expect(await admin.getGrantedCourseIds('u')).toEqual(['git']);
    expect(await admin.getGrantedCourseIds('u')).toEqual([]);
  });

  it('stores the list and updates acharyaIds only on courses that exist', async () => {
    const batch = batchOf();
    const snaps = [
      { exists: true, ref: 'courses/new' },
      { exists: false, ref: 'courses/ghost' },
      { exists: true, ref: 'courses/old' },
    ];
    const db = {
      doc: vi.fn((p: string) => p),
      getAll: vi.fn().mockResolvedValue(snaps),
      batch: vi.fn().mockReturnValue(batch),
    } as never;
    await firebaseRoleAdmin({} as never, db).applyCourseGrants('u', ['new', 'ghost'], {
      added: ['new', 'ghost'],
      removed: ['old'],
    });
    expect(batch.set).toHaveBeenCalledWith(
      'users/u',
      { grantedCourseIds: ['new', 'ghost'] },
      { merge: true },
    );
    expect(batch.update).toHaveBeenCalledTimes(2);
    expect(batch.update).toHaveBeenCalledWith('courses/new', { acharyaIds: 'union:u' });
    expect(batch.update).toHaveBeenCalledWith('courses/old', { acharyaIds: 'remove:u' });
    expect(batch.commit).toHaveBeenCalledOnce();
  });

  it('only stores the list when no course is added or removed', async () => {
    const batch = batchOf();
    const db = {
      doc: vi.fn((p: string) => p),
      getAll: vi.fn(),
      batch: vi.fn().mockReturnValue(batch),
    } as never;
    await firebaseRoleAdmin({} as never, db).applyCourseGrants('u', [], { added: [], removed: [] });
    expect((db as { getAll: unknown }).getAll).not.toHaveBeenCalled();
    expect(batch.set).toHaveBeenCalledWith('users/u', { grantedCourseIds: [] }, { merge: true });
    expect(batch.update).not.toHaveBeenCalled();
  });
});

describe('firestoreAssignStore', () => {
  it('reads course status and title, undefined for a missing course', async () => {
    const db = {
      doc: vi.fn((p: string) => p),
      getAll: vi
        .fn()
        .mockResolvedValue([
          { exists: true, get: (k: string) => (k === 'status' ? 'published' : 'Git') },
          { exists: false },
        ]),
    } as never;
    expect(await firestoreAssignStore(db).courses(['git', 'gone'])).toEqual({
      git: { status: 'published', title: 'Git' },
      gone: undefined,
    });
  });

  it('finds signed-in users by email in chunks of 30', async () => {
    const emails = Array.from({ length: 31 }, (_, i) => `u${i}@nonstopio.com`);
    const get = vi
      .fn()
      .mockResolvedValueOnce({ docs: [{ id: 'uid0', get: () => emails[0] }] })
      .mockResolvedValueOnce({ docs: [{ id: 'uid30', get: () => emails[30] }] });
    const where = vi.fn().mockReturnValue({ get });
    const db = { collection: vi.fn().mockReturnValue({ where }) } as never;
    const found = await firestoreAssignStore(db).signedInUsers(emails);
    expect(where).toHaveBeenCalledTimes(2);
    expect(where.mock.calls[0]?.[2]).toHaveLength(30);
    expect(where.mock.calls[1]?.[2]).toHaveLength(1);
    expect([...found]).toEqual([
      [emails[0], 'uid0'],
      [emails[30], 'uid30'],
    ]);
    expect(await firestoreAssignStore(db).signedInUsers([])).toEqual(new Map());
  });

  it('reports which assignment ids exist', async () => {
    const db = {
      doc: vi.fn((p: string) => p),
      getAll: vi.fn().mockResolvedValue([
        { exists: true, id: 'a' },
        { exists: false, id: 'b' },
      ]),
    } as never;
    expect(await firestoreAssignStore(db).existingAssignmentIds(['a', 'b'])).toEqual(
      new Set(['a']),
    );
    expect(await firestoreAssignStore(db).existingAssignmentIds([])).toEqual(new Set());
  });

  it('creates assignments (never sets) in batches of 400', async () => {
    const batches = [batchOf(), batchOf()];
    const db = {
      doc: vi.fn((p: string) => p),
      batch: vi.fn().mockReturnValueOnce(batches[0]).mockReturnValueOnce(batches[1]),
    } as never;
    const docs = Array.from({ length: 401 }, (_, i) => ({
      id: `git__${i}`,
      email: `u${i}@nonstopio.com`,
      uid: i === 0 ? 'priya' : null,
      courseId: 'git',
      dueAt: i === 0 ? 1000 : null,
      mandatory: true,
      reminder: 'weekly' as const,
    }));
    await firestoreAssignStore(db).createAssignments('k', docs);
    expect(batches[0]?.create).toHaveBeenCalledTimes(400);
    expect(batches[1]?.create).toHaveBeenCalledTimes(1);
    expect(batches[0]?.set).not.toHaveBeenCalled();
    expect(batches[0]?.create).toHaveBeenNthCalledWith(1, 'assignments/git__0', {
      email: 'u0@nonstopio.com',
      uid: 'priya',
      courseId: 'git',
      assignedBy: 'k',
      assignedAt: 'NOW',
      dueAt: 'ts:1000',
      mandatory: true,
      reminder: 'weekly',
      status: 'assigned',
    });
    expect(batches[0]?.create).toHaveBeenNthCalledWith(
      2,
      'assignments/git__1',
      expect.objectContaining({ uid: null, dueAt: null }),
    );
    expect(batches[0]?.commit).toHaveBeenCalledOnce();
    expect(batches[1]?.commit).toHaveBeenCalledOnce();
  });

  it('bumps the course counters and the org total in one batch, and audits', async () => {
    const batch = batchOf();
    const add = vi.fn().mockResolvedValue(undefined);
    const db = {
      doc: vi.fn((p: string) => p),
      batch: vi.fn().mockReturnValue(batch),
      collection: vi.fn().mockReturnValue({ add }),
    } as never;
    const store = firestoreAssignStore(db);
    await store.bumpAssigned({ git: 2, sql: 3 });
    expect(batch.set).toHaveBeenCalledWith('stats/course_git', { assigned: '+2' }, { merge: true });
    expect(batch.set).toHaveBeenCalledWith('stats/course_sql', { assigned: '+3' }, { merge: true });
    expect(batch.set).toHaveBeenCalledWith(
      'stats/org',
      { assignmentsTotal: '+5' },
      { merge: true },
    );
    expect(batch.commit).toHaveBeenCalledOnce();
    await store.audit({ action: 'assign', by: 'k', detail: { count: 5 } });
    expect(add).toHaveBeenCalledWith({
      action: 'assign',
      by: 'k',
      detail: { count: 5 },
      at: 'NOW',
    });
  });
});

describe('firestoreCooldownAdmin', () => {
  const dbWith = (snap: object) => {
    const update = vi.fn().mockResolvedValue(undefined);
    const add = vi.fn().mockResolvedValue(undefined);
    const doc = vi.fn(() => ({ get: vi.fn().mockResolvedValue(snap), update }));
    return { db: { doc, collection: vi.fn().mockReturnValue({ add }) } as never, update, add, doc };
  };

  it('sets lastAttemptAt of that Pariksha to epoch 0', async () => {
    const { db, update, doc } = dbWith({ exists: true, get: () => ({ attempts: 1 }) });
    expect(await firestoreCooldownAdmin(db).resetCooldown('u', 'git', 'pk')).toBe(true);
    expect(doc).toHaveBeenCalledWith('progress/u_git');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ parts: ['pariksha', 'pk', 'lastAttemptAt'] }),
      'ts:0',
    );
  });

  it('reports a missing progress document or Pariksha entry, changing nothing', async () => {
    for (const snap of [{ exists: false }, { exists: true, get: () => undefined }]) {
      const { db, update } = dbWith(snap);
      expect(await firestoreCooldownAdmin(db).resetCooldown('u', 'git', 'pk')).toBe(false);
      expect(update).not.toHaveBeenCalled();
    }
  });

  it('audits with a server timestamp', async () => {
    const { db, add } = dbWith({});
    await firestoreCooldownAdmin(db).audit({ action: 'cooldown.reset', by: 'k', detail: {} });
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ at: 'NOW' }));
  });
});

describe('firestoreMailer', () => {
  it('queues an outbox document in the Trigger Email shape', async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const collection = vi.fn().mockReturnValue({ add });
    const db = { collection } as never;
    await firestoreMailer(db).send({ to: 'a@example.com', subject: 'S', text: 'T' });
    expect(collection).toHaveBeenCalledWith('mail');
    expect(add).toHaveBeenCalledWith({
      to: 'a@example.com',
      message: { subject: 'S', text: 'T' },
      createdAt: 'NOW',
    });
  });
});

describe('firestoreReminderStore', () => {
  const data = (over: object = {}) => ({
    email: 'a@nonstopio.com',
    courseId: 'git',
    status: 'started',
    mandatory: true,
    reminder: 'weekly',
    assignedAt: ts(10),
    dueAt: ts(20),
    lastRemindedAt: ts(30),
    ...over,
  });
  const snap = (id: string, over: object = {}) => ({ id, data: () => data(over) });
  const expected = {
    id: 'x',
    email: 'a@nonstopio.com',
    courseId: 'git',
    status: 'started',
    mandatory: true,
    reminder: 'weekly',
    assignedAt: 10,
    dueAt: 20,
    lastRemindedAt: 30,
  };

  it('lists a course’s open assignments, reading times as milliseconds', async () => {
    const get = vi.fn().mockResolvedValue({
      docs: [snap('x'), snap('y', { dueAt: null, lastRemindedAt: undefined, mandatory: false })],
    });
    const limit = vi.fn().mockReturnValue({ get });
    const where2 = vi.fn().mockReturnValue({ limit });
    const where1 = vi.fn().mockReturnValue({ where: where2 });
    const db = { collection: vi.fn().mockReturnValue({ where: where1 }) } as never;
    const out = await firestoreReminderStore(db).forCourse('git');
    expect(where1).toHaveBeenCalledWith('courseId', '==', 'git');
    expect(where2).toHaveBeenCalledWith('status', 'in', ['assigned', 'started']);
    expect(out[0]).toEqual(expected);
    expect(out[1]).toMatchObject({ id: 'y', mandatory: false, dueAt: null, lastRemindedAt: null });
  });

  it('lists the assignments of emails in chunks of 30', async () => {
    const emails = Array.from({ length: 31 }, (_, i) => `u${i}@nonstopio.com`);
    const get = vi
      .fn()
      .mockResolvedValueOnce({ docs: [snap('x')] })
      .mockResolvedValueOnce({ docs: [snap('y')] });
    const where = vi.fn().mockReturnValue({ get });
    const db = { collection: vi.fn().mockReturnValue({ where }) } as never;
    const out = await firestoreReminderStore(db).forEmails(emails);
    expect(out.map((c) => c.id)).toEqual(['x', 'y']);
    expect(where).toHaveBeenCalledTimes(2);
  });

  it('lists every open assignment for the daily run', async () => {
    const get = vi.fn().mockResolvedValue({ docs: [snap('x')] });
    const limit = vi.fn().mockReturnValue({ get });
    const where = vi.fn().mockReturnValue({ limit });
    const db = { collection: vi.fn().mockReturnValue({ where }) } as never;
    expect(await firestoreReminderStore(db).scheduled()).toEqual([expected]);
    expect(where).toHaveBeenCalledOnce();
    expect(where).toHaveBeenCalledWith('status', 'in', ['assigned', 'started']);
    expect(limit).toHaveBeenCalledWith(2000);
  });

  it('reads course titles, none when there are no ids', async () => {
    const db = {
      doc: vi.fn((p: string) => p),
      getAll: vi.fn().mockResolvedValue([{ id: 'git', get: () => 'Git basics' }]),
    } as never;
    expect(await firestoreReminderStore(db).courseTitles(['git'])).toEqual({ git: 'Git basics' });
    expect(await firestoreReminderStore(db).courseTitles([])).toEqual({});
  });

  it('stamps lastRemindedAt in batches of 400', async () => {
    const batches = [batchOf(), batchOf()];
    const db = {
      doc: vi.fn((p: string) => p),
      batch: vi.fn().mockReturnValueOnce(batches[0]).mockReturnValueOnce(batches[1]),
    } as never;
    await firestoreReminderStore(db).markReminded(Array.from({ length: 401 }, (_, i) => `a${i}`));
    expect(batches[0]?.update).toHaveBeenCalledTimes(400);
    expect(batches[1]?.update).toHaveBeenCalledWith('assignments/a400', { lastRemindedAt: 'NOW' });
  });

  it('reads the reminder switch, off when config is missing or empty', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ get: () => ({ enabled: true }) })
      .mockResolvedValueOnce({ get: () => ({ enabled: false }) })
      .mockResolvedValueOnce({ get: () => undefined });
    const db = { doc: vi.fn().mockReturnValue({ get }) } as never;
    const store = firestoreReminderStore(db);
    expect(await store.remindersEnabled()).toBe(true);
    expect(await store.remindersEnabled()).toBe(false);
    expect(await store.remindersEnabled()).toBe(false);
  });

  it('audits', async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const db = { collection: vi.fn().mockReturnValue({ add }) } as never;
    await firestoreReminderStore(db).audit({ action: 'reminders.send', by: 'k', detail: {} });
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ at: 'NOW' }));
  });
});

describe('firestoreAttemptStatsStore', () => {
  it('reads the learner’s progress', async () => {
    const db = {
      doc: vi.fn((p: string) => ({ get: async () => ({ data: () => ({ p }) }) })),
    } as never;
    expect(await firestoreAttemptStatsStore(db).progress('u', 'git')).toEqual({
      p: 'progress/u_git',
    });
  });

  it('adds score and first-try counters with merge', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const doc = vi.fn().mockReturnValue({ set });
    const db = { doc } as never;
    await firestoreAttemptStatsStore(db).bumpAttemptStats('git', {
      scoreSum: 0.5,
      scoreCount: 1,
      questionFirstTry: { q1: { correct: 1, total: 1 } },
    });
    expect(doc).toHaveBeenCalledWith('stats/course_git');
    expect(set).toHaveBeenCalledWith(
      {
        scoreSum: '+0.5',
        scoreCount: '+1',
        questionFirstTry: { q1: { correct: '+1', total: '+1' } },
      },
      { merge: true },
    );
  });
});

describe('firestoreRollupStore', () => {
  it('counts with aggregation queries and overwrites the org counters', async () => {
    const countQuery = (n: number) => ({
      count: () => ({ get: async () => ({ data: () => ({ count: n }) }) }),
    });
    const set = vi.fn().mockResolvedValue(undefined);
    const whereProgress = vi.fn().mockReturnValue(countQuery(80));
    const whereAssignments = vi.fn().mockReturnValue(countQuery(90));
    const doc = vi.fn().mockReturnValue({ set });
    const db = {
      collection: vi.fn((name: string) =>
        name === 'users'
          ? countQuery(120)
          : name === 'progress'
            ? { where: whereProgress }
            : { ...countQuery(300), where: whereAssignments },
      ),
      doc,
    } as never;
    const store = firestoreRollupStore(db);
    expect(await store.countUsers()).toBe(120);
    expect(await store.countActiveSince(5000)).toBe(80);
    expect(whereProgress).toHaveBeenCalledWith('lastActiveAt', '>=', 'ts:5000');
    expect(await store.countAssignments()).toBe(300);
    expect(await store.countCompletedAssignments()).toBe(90);
    expect(whereAssignments).toHaveBeenCalledWith('status', '==', 'completed');
    const counts = {
      usersTotal: 1,
      activeLearners30d: 2,
      assignmentsTotal: 3,
      assignmentsCompleted: 4,
    };
    await store.writeOrgCounts(counts);
    expect(doc).toHaveBeenCalledWith('stats/org');
    expect(set).toHaveBeenCalledWith(counts, { merge: true });
  });
});

describe('firestoreCourseStore', () => {
  /** A db whose documents are plain objects with the few methods the adapter uses. */
  function dbWith(docs: Record<string, object | undefined>) {
    const tx = {
      get: vi.fn(async (ref: { path: string }) => ({
        exists: docs[ref.path] !== undefined,
        data: () => docs[ref.path],
      })),
      set: vi.fn(),
    };
    const refOf = (path: string): object => ({
      path,
      get: async () => ({ exists: docs[path] !== undefined, data: () => docs[path] }),
      update: updates,
      collection: (name: string) => ({ doc: (id: string) => refOf(`${path}/${name}/${id}`) }),
    });
    const updates = vi.fn().mockResolvedValue(undefined);
    const add = vi.fn().mockResolvedValue(undefined);
    const db = {
      doc: refOf,
      collection: vi.fn().mockReturnValue({ add }),
      runTransaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    } as never;
    return { db, tx, updates, add };
  }
  const live = { version: 2, status: 'published', acharyaIds: ['asha'] };
  const draft = { rev: 4, course: { id: 'c' }, answers: { pk: { q: ['a'] } } };
  const plan = {
    version: 3,
    course: { id: 'c', title: 'T' },
    answers: { pk: { q: ['a'] } },
  } as never;

  it('reads the live course and the draft, with undefined for missing ones', async () => {
    const { db } = dbWith({ 'courses/c': live, 'courses/c/drafts/current': draft });
    const store = firestoreCourseStore(db);
    expect(await store.getLive('c')).toEqual(live);
    expect(await store.getLive('x')).toBeUndefined();
    expect(await store.getDraft('c')).toEqual(draft);
    expect(await store.getDraft('x')).toBeUndefined();
  });

  it('creates the course, its first draft and the grant, unless the id is taken', async () => {
    const input = {
      courseId: 'c',
      uid: 'asha',
      course: { id: 'c' },
      draft: { course: { id: 'c', title: 'T' }, answers: {} },
    } as never;
    const fresh = dbWith({});
    expect(await firestoreCourseStore(fresh.db).create(input)).toBe(true);
    expect(fresh.tx.set).toHaveBeenCalledWith(expect.objectContaining({ path: 'courses/c' }), {
      id: 'c',
    });
    expect(fresh.tx.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'courses/c/drafts/current' }),
      { rev: 1, updatedAt: 'NOW', updatedBy: 'asha', course: { id: 'c', title: 'T' }, answers: {} },
    );
    expect(fresh.tx.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'users/asha' }),
      { grantedCourseIds: 'union:c' },
      { merge: true },
    );
    const taken = dbWith({ 'courses/c': live });
    expect(await firestoreCourseStore(taken.db).create(input)).toBe(false);
    expect(taken.tx.set).not.toHaveBeenCalled();
  });

  it('publishes: writes the live course, the answers and the version snapshot', async () => {
    const { db, tx } = dbWith({ 'courses/c': live, 'courses/c/drafts/current': draft });
    const decide = vi.fn().mockReturnValue(plan);
    expect(await firestoreCourseStore(db).release('c', 'asha', null, decide)).toBe(3);
    expect(decide).toHaveBeenCalledWith({ live, draft, snapshot: undefined });
    const published = { id: 'c', title: 'T', publishedAt: 'NOW' };
    expect(tx.set).toHaveBeenCalledWith(expect.objectContaining({ path: 'courses/c' }), published);
    expect(tx.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'courses/c/private/answers' }),
      { pk: { q: ['a'] } },
    );
    expect(tx.set).toHaveBeenCalledWith(expect.objectContaining({ path: 'courses/c/versions/3' }), {
      version: 3,
      publishedAt: 'NOW',
      publishedBy: 'asha',
      course: published,
      answers: { pk: { q: ['a'] } },
    });
    expect(tx.set).toHaveBeenCalledTimes(3);
  });

  it('rolls back: loads the snapshot and resets the draft', async () => {
    const snapshot = { version: 1, course: { id: 'c' }, answers: {} };
    const { db, tx } = dbWith({ 'courses/c': live, 'courses/c/versions/1': snapshot });
    const reset = { rev: 5, course: { id: 'c' }, answers: {} };
    const decide = vi.fn().mockReturnValue({ ...(plan as object), resetDraft: reset });
    await firestoreCourseStore(db).release('c', 'asha', 1, decide);
    expect(decide).toHaveBeenCalledWith({ live, draft: undefined, snapshot });
    expect(tx.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'courses/c/drafts/current' }),
      { ...reset, updatedAt: 'NOW', updatedBy: 'asha' },
    );
  });

  it('passes an undefined live course to decide when there is none', async () => {
    const { db } = dbWith({});
    const decide = vi.fn().mockReturnValue(plan);
    await firestoreCourseStore(db).release('c', 'asha', null, decide);
    expect(decide).toHaveBeenCalledWith({ live: undefined, draft: undefined, snapshot: undefined });
  });

  it('sets the status and audits with a server timestamp', async () => {
    const { db, updates, add } = dbWith({});
    const store = firestoreCourseStore(db);
    await store.setStatus('c', 'archived');
    expect(updates).toHaveBeenCalledWith({ status: 'archived' });
    await store.audit({ action: 'course.archive', by: 'k', detail: {} });
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ at: 'NOW' }));
  });
});

describe('firestoreBackupPort', () => {
  it('exports every collection of the default database to the prefix', async () => {
    const admin = {
      getProjectId: vi.fn().mockResolvedValue('demo-gurukul'),
      databasePath: vi.fn((p: string, d: string) => `projects/${p}/databases/${d}`),
      exportDocuments: vi.fn().mockResolvedValue([{}]),
    };
    await firestoreBackupPort(admin as never).exportTo('gs://b/backups/2026-11-01');
    expect(admin.exportDocuments).toHaveBeenCalledWith({
      name: 'projects/demo-gurukul/databases/(default)',
      outputUriPrefix: 'gs://b/backups/2026-11-01',
      collectionIds: [],
    });
  });
});
