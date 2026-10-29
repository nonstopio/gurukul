import { DEFAULT_ORG_CONFIG } from '@gurukul/schema';
import { describe, expect, it, vi } from 'vitest';
import {
  firebaseRoleAdmin,
  firestoreCertificateAdmin,
  firestoreGradingStore,
  firestoreProgressStore,
  firestoreUserStore,
} from '../src/stores.js';

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => 'NOW', increment: (n: number) => `+${n}` },
}));

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
    batch: vi.fn().mockReturnValue({ update, set, commit }),
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
      getUser: vi.fn().mockResolvedValue({ customClaims: { educator: true } }),
      setCustomUserClaims: vi.fn().mockResolvedValue(undefined),
      revokeRefreshTokens: vi.fn().mockResolvedValue(undefined),
    };
    const f = fakeDb();
    const admin = firebaseRoleAdmin(auth as never, f.db);
    expect(await admin.getClaims('u')).toEqual({ educator: true });
    await admin.setClaims('u', { admin: true });
    await admin.revokeTokens('u');
    await admin.mirrorRoles('u', {
      claims: { educator: false, admin: true },
      roles: ['learner', 'admin'],
    });
    await admin.audit({
      action: 'a',
      by: 'b',
      target: 'c',
      detail: { educator: false, admin: true },
    });
    expect(auth.setCustomUserClaims).toHaveBeenCalledWith('u', { admin: true });
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith('u');
    expect(f.set).toHaveBeenCalledWith({ roles: ['learner', 'admin'] }, { merge: true });
    expect(f.add).toHaveBeenCalledWith(expect.objectContaining({ action: 'a', at: 'NOW' }));
  });
});

describe('firestoreProgressStore', () => {
  it('reads a course, returning undefined when it is missing', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ exists: true, data: () => ({ id: 'git' }) })
      .mockResolvedValueOnce({ exists: false });
    const db = { doc: vi.fn().mockReturnValue({ get }) } as never;
    const store = firestoreProgressStore(db);
    expect(await store.course('git')).toEqual({ id: 'git' });
    expect(await store.course('nope')).toBeUndefined();
  });

  it('writes derived fields, stamping completedAt only on completion', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const db = { doc: vi.fn().mockReturnValue({ update }) } as never;
    const store = firestoreProgressStore(db);
    await store.writeDerived('u_git', { percent: 50, completed: false });
    await store.writeDerived('u_git', { percent: 100, completed: true });
    expect(update).toHaveBeenNthCalledWith(1, { percent: 50 });
    expect(update).toHaveBeenNthCalledWith(2, { percent: 100, completedAt: 'NOW' });
  });

  it('records who started a course under its learners, with the name from the profile', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const get = vi
      .fn()
      .mockResolvedValueOnce({ get: () => 'Priya Rao' })
      .mockResolvedValueOnce({ get: () => undefined });
    const doc = vi.fn((p: string) => (p.startsWith('users/') ? { get } : { set }));
    const store = firestoreProgressStore({ doc } as never);
    await store.recordLearner('priya', 'git');
    await store.recordLearner('ghost', 'git');
    expect(doc).toHaveBeenCalledWith('courses/git/learners/priya');
    expect(set).toHaveBeenNthCalledWith(1, { displayName: 'Priya Rao', startedAt: 'NOW' });
    expect(set).toHaveBeenNthCalledWith(2, { displayName: '', startedAt: 'NOW' });
  });

  it('adds the delta to the course and org counters in one transaction', async () => {
    const set = vi.fn();
    const tx = {
      get: vi.fn().mockResolvedValue({ get: () => [2, 1] }),
      set,
    };
    const db = {
      doc: vi.fn((p: string) => p),
      runTransaction: vi.fn((fn: (t: unknown) => unknown) => fn(tx)),
    } as never;
    await firestoreProgressStore(db).bumpStats('git', {
      started: 1,
      completed: 1,
      certified: 1,
      finishDays: 2.5,
      finishBucket: '3',
      chaptersDone: [1, 3],
      lessons: 4,
      week: '2026-W44',
      assignmentsCompleted: 1,
    });
    expect(set).toHaveBeenCalledWith(
      'stats/course_git',
      {
        started: '+1',
        completed: '+1',
        certified: '+1',
        finishDaysSum: '+2.5',
        finishDaysHistogram: { '3': '+1' },
        chapterCompletions: [2, 2, 0, 1],
      },
      { merge: true },
    );
    expect(set).toHaveBeenCalledWith(
      'stats/org',
      {
        started: '+1',
        completed: '+1',
        assignmentsCompleted: '+1',
        weekly: { '2026-W44': '+4' },
      },
      { merge: true },
    );
  });

  it('starts chapterCompletions from nothing when the course has no stats yet', async () => {
    const set = vi.fn();
    const tx = { get: vi.fn().mockResolvedValue({ get: () => undefined }), set };
    const db = {
      doc: vi.fn((p: string) => p),
      runTransaction: vi.fn((fn: (t: unknown) => unknown) => fn(tx)),
    } as never;
    await firestoreProgressStore(db).bumpStats('git', {
      started: 1,
      completed: 0,
      certified: 0,
      finishDays: 0,
      finishBucket: null,
      chaptersDone: [],
      lessons: 0,
      week: '2026-W44',
      assignmentsCompleted: 0,
    });
    expect(set).toHaveBeenCalledWith(
      'stats/course_git',
      expect.not.objectContaining({ finishDaysHistogram: expect.anything() }),
      { merge: true },
    );
  });

  it('moves the learner’s assignments to the status and counts only those that changed', async () => {
    const doc = (ref: string, status: string) => ({ ref, get: () => status });
    const f = fakeDb([doc('r1', 'assigned'), doc('r2', 'started')] as never);
    expect(await firestoreProgressStore(f.db).setAssignmentStatus('u', 'git', 'started')).toBe(1);
    expect(f.update).toHaveBeenCalledOnce();
    expect(f.update).toHaveBeenCalledWith('r1', { status: 'started' });
    const same = fakeDb([doc('r2', 'started')] as never);
    expect(await firestoreProgressStore(same.db).setAssignmentStatus('u', 'git', 'started')).toBe(
      0,
    );
    expect(same.commit).not.toHaveBeenCalled();
    const none = fakeDb();
    expect(await firestoreProgressStore(none.db).setAssignmentStatus('u', 'git', 'started')).toBe(
      0,
    );
    expect(none.commit).not.toHaveBeenCalled();
  });
});

describe('firestoreProgressStore.signatory', () => {
  const dbWith = (signatory: unknown) =>
    ({ doc: () => ({ get: async () => ({ get: () => signatory }) }) }) as never;

  it('reads the signatory from config/org', async () => {
    const saved = { name: 'Rhea Sample', role: 'Dean' };
    expect(await firestoreProgressStore(dbWith(saved)).signatory()).toEqual(saved);
  });

  it('falls back to the default when none is saved or it is malformed', async () => {
    for (const bad of [undefined, { name: '', role: 'x' }]) {
      expect(await firestoreProgressStore(dbWith(bad)).signatory()).toEqual(
        DEFAULT_ORG_CONFIG.signatory,
      );
    }
  });
});

describe('firestoreProgressStore.issueCertificate', () => {
  function txDb(opts: { progress?: object | null; user?: object; counter?: object }) {
    const tx = {
      get: vi.fn(async (ref: string) => {
        if (ref.startsWith('progress/')) {
          const data =
            opts.progress === null ? undefined : (opts.progress ?? { certificateId: null });
          return {
            exists: opts.progress !== null,
            get: (k: string) => (data as never)?.[k],
            data: () => data,
          };
        }
        if (ref.startsWith('users/')) return { data: () => opts.user };
        return { data: () => opts.counter };
      }),
      set: vi.fn(),
      update: vi.fn(),
    };
    const db = {
      doc: vi.fn((path: string) => path),
      runTransaction: vi.fn((fn: (t: unknown) => unknown) => fn(tx)),
    };
    return { db: db as never, tx };
  }
  const grant = {
    uid: 'u',
    courseId: 'git-basics',
    courseTitle: 'Git basics',
    courseVersion: 2,
    signatoryName: 'A',
    signatoryRole: 'K',
  };

  it('takes the next sequence, writes the certificate and links it, all in the transaction', async () => {
    vi.useFakeTimers({ now: new Date('2026-05-01T00:00:00Z') });
    const { db, tx } = txDb({ user: { displayName: 'Priya' }, counter: { '2026': 4 } });
    expect(await firestoreProgressStore(db).issueCertificate('u_git-basics', grant)).toBe(
      'NSG-GIT-26-0005',
    );
    expect(tx.set).toHaveBeenCalledWith('counters/certificates', { '2026': 5 }, { merge: true });
    expect(tx.set).toHaveBeenCalledWith(
      'certificates/NSG-GIT-26-0005',
      expect.objectContaining({
        id: 'NSG-GIT-26-0005',
        learnerName: 'Priya',
        revoked: false,
        issuedAt: 'NOW',
      }),
    );
    expect(tx.update).toHaveBeenCalledWith('progress/u_git-basics', {
      certificateId: 'NSG-GIT-26-0005',
    });
    vi.useRealTimers();
  });

  it('does nothing when a certificate already exists or the progress is gone', async () => {
    for (const progress of [{ certificateId: 'NSG-GIT-26-0001' }, null]) {
      const { db, tx } = txDb({ progress });
      expect(await firestoreProgressStore(db).issueCertificate('u_git-basics', grant)).toBeNull();
      expect(tx.set).not.toHaveBeenCalled();
      expect(tx.update).not.toHaveBeenCalled();
    }
  });
});

describe('firestoreGradingStore', () => {
  it('reads the course, the private answer key and the learner’s progress', async () => {
    const db = {
      doc: vi.fn((path: string) => ({ get: async () => ({ data: () => ({ path }) }) })),
    } as never;
    const store = firestoreGradingStore(db);
    expect(await store.getCourse('git')).toEqual({ path: 'courses/git' });
    expect(await store.getAnswers('git')).toEqual({ path: 'courses/git/private/answers' });
    expect(await store.getProgress('u', 'git')).toEqual({ path: 'progress/u_git' });
  });

  it('records the attempt and the Quiz result in one transaction', async () => {
    const set = vi.fn();
    const attemptRef = { id: 'att1' };
    const progressRef = { collection: () => ({ doc: () => attemptRef }) };
    const tx = { get: vi.fn().mockResolvedValue({ data: () => ({ seen: true }) }), set };
    const db = {
      doc: vi.fn(() => progressRef),
      runTransaction: vi.fn((fn: (t: unknown) => unknown) => fn(tx)),
    } as never;
    const decide = vi.fn().mockReturnValue({ best: 0.8, passed: true, attempts: 2 });
    const attempt = { uid: 'u', courseId: 'git', quizId: 'pk', score: 0.8 };
    const out = await firestoreGradingStore(db).recordAttempt(attempt as never, decide);
    expect(decide).toHaveBeenCalledWith({ seen: true });
    expect(out).toEqual({ attemptId: 'att1', update: { best: 0.8, passed: true, attempts: 2 } });
    expect(set).toHaveBeenCalledWith(attemptRef, { ...attempt, createdAt: 'NOW' });
    expect(set).toHaveBeenCalledWith(
      progressRef,
      {
        quiz: { pk: { best: 0.8, passed: true, attempts: 2, lastAttemptAt: 'NOW' } },
        lastActiveAt: 'NOW',
      },
      { merge: true },
    );
  });
});

describe('firestoreCertificateAdmin', () => {
  it('sets revoked and its date on an existing certificate and reports a missing one', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        exists: true,
        get: (f: string) => ({ uid: 'u1', courseTitle: 'Git basics', revoked: false })[f],
      })
      .mockResolvedValueOnce({ exists: false });
    const db = { doc: vi.fn().mockReturnValue({ get, update }) } as never;
    const admin = firestoreCertificateAdmin(db);
    expect(await admin.setRevoked('NSG-GIT-26-0001', true)).toEqual({
      uid: 'u1',
      courseTitle: 'Git basics',
      changed: true,
    });
    expect(update).toHaveBeenCalledWith({ revoked: true, revokedAt: 'NOW' });
    expect(await admin.setRevoked('NSG-GIT-26-0002', true)).toBeNull();
    expect(update).toHaveBeenCalledOnce();
  });

  it('clears the revocation date on restore', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const get = vi.fn().mockResolvedValue({
      exists: true,
      get: (f: string) => ({ uid: 'u1', courseTitle: 'Git basics', revoked: false })[f],
    });
    const db = { doc: vi.fn().mockReturnValue({ get, update }) } as never;
    expect(await firestoreCertificateAdmin(db).setRevoked('NSG-GIT-26-0001', false)).toMatchObject({
      changed: false,
    });
    expect(update).toHaveBeenCalledWith({ revoked: false, revokedAt: null });
  });

  it('reads the learner email from the profile, or null when there is none', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ get: () => 'asha@example.com' })
      .mockResolvedValueOnce({ get: () => undefined })
      .mockResolvedValueOnce({ get: () => '' });
    const db = { doc: vi.fn().mockReturnValue({ get }) } as never;
    const admin = firestoreCertificateAdmin(db);
    expect(await admin.emailOf('u1')).toBe('asha@example.com');
    expect(await admin.emailOf('u2')).toBeNull();
    expect(await admin.emailOf('u3')).toBeNull();
  });

  it('writes the audit entry with a server timestamp', async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const db = { collection: vi.fn().mockReturnValue({ add }) } as never;
    await firestoreCertificateAdmin(db).audit({
      action: 'certificate.revoke',
      by: 'k',
      target: 'x',
      detail: { revoked: true },
    });
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'certificate.revoke', at: 'NOW' }),
    );
  });
});
