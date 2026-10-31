import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCourse } from './fake-data';

const store = vi.hoisted(() => ({
  docs: new Map<string, unknown>(),
  queryDocs: [] as Array<{ id: string; data: () => unknown }>,
  snapCb: undefined as undefined | ((s: unknown) => void),
  calls: [] as unknown[][],
  queries: [] as unknown[],
  setError: undefined as unknown,
  createdByRival: false,
}));

vi.mock('firebase/firestore', () => ({
  arrayUnion: (v: string) => ({ union: v }),
  collection: (_db: unknown, name: string) => ({ collection: name }),
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  getDoc: async (ref: { path: string }) => ({
    id: ref.path.split('/').pop(),
    exists: () => store.docs.has(ref.path),
    data: () => store.docs.get(ref.path),
  }),
  getDocs: async (q: unknown) => {
    store.queries.push(q);
    return { docs: store.queryDocs };
  },
  limit: (n: number) => ({ limit: n }),
  onSnapshot: (_ref: unknown, cb: (s: unknown) => void) => {
    store.snapCb = cb;
    return () => {};
  },
  orderBy: (f: string, d: string) => ({ orderBy: [f, d] }),
  query: (...parts: unknown[]) => ({ parts }),
  serverTimestamp: () => 'NOW',
  setDoc: async (ref: { path: string }, data: unknown) => {
    if (store.setError) {
      if (store.createdByRival) store.docs.set(ref.path, {});
      throw store.setError;
    }
    store.calls.push(['set', ref.path, data]);
  },
  updateDoc: async (ref: { path: string }, data: unknown) => {
    store.calls.push(['update', ref.path, data]);
  },
  where: (f: string, op: string, v: unknown) => ({ where: [f, op, v] }),
}));

import { firebaseLearnerData } from '../src/data/firebase';

const data = firebaseLearnerData({} as never);
const ts = (ms: number) => ({ toDate: () => new Date(ms), toMillis: () => ms });
const course = () => ({ ...makeCourse(), publishedAt: ts(1) });

beforeEach(() => {
  store.docs.clear();
  store.queryDocs = [];
  store.calls = [];
  store.setError = undefined;
  store.createdByRival = false;
  store.queries = [];
});

describe('firebaseLearnerData', () => {
  it('lists courses through the schema', async () => {
    store.queryDocs = [{ id: 'git', data: () => course() }];
    expect((await data.listCourses()).map((c) => c.id)).toEqual(['git']);
  });

  it('lists for a person with teams: public courses, and their own teams’ courses, newest first', async () => {
    const old = { ...course(), id: 'old', publishedAt: null, visibility: 'public' };
    const fresh = {
      ...course(),
      id: 'fresh',
      publishedAt: ts(9),
      visibility: 'teams',
      visibleTeamIds: ['qa'],
    };
    store.queryDocs = [
      { id: 'old', data: () => old },
      { id: 'fresh', data: () => fresh },
    ];
    const teams = Array.from({ length: 20 }, (_, i) => `t${i}`);
    const listed = await data.listCourses({ teamIds: teams, staff: false });
    expect(store.queries).toHaveLength(2);
    const filters = (store.queries as { parts: { where?: unknown[] }[] }[]).map((q) =>
      q.parts.flatMap((p) => (p.where ? [p.where] : [])),
    );
    expect(filters[0]).toContainEqual(['visibility', '==', 'public']);
    expect(filters[1]).toContainEqual(['visibility', '==', 'teams']);
    expect(filters[1]).toContainEqual(['visibleTeamIds', 'array-contains-any', teams.slice(0, 15)]);
    expect(listed.map((c) => c.id)).toEqual(['fresh', 'fresh', 'old', 'old']);
    expect(listed[0]).toMatchObject({ visibility: 'teams', visibleTeamIds: ['qa'] });
    expect(listed[3]).toMatchObject({ visibility: 'public', visibleTeamIds: [] });
  });

  it('lists only the public courses for a person with no teams, and everything for staff', async () => {
    store.queryDocs = [{ id: 'git', data: () => course() }];
    await data.listCourses({ teamIds: [], staff: false });
    expect(store.queries).toHaveLength(1);
    store.queries = [];
    await data.listCourses();
    expect(store.queries).toHaveLength(1);
    store.queries = [];
    await data.listCourses({ teamIds: [], staff: true });
    expect(store.queries).toHaveLength(1);
    const parts = (store.queries[0] as { parts: { where?: unknown[]; orderBy?: unknown }[] }).parts;
    expect(parts.some((p) => p.orderBy)).toBe(true);
    expect(parts.some((p) => p.where?.[0] === 'visibility')).toBe(false);
  });

  it('gets one course, or null when it is missing', async () => {
    store.docs.set('courses/git', course());
    expect((await data.getCourse('git'))?.title).toBe('Git, the NonStop Way');
    expect(await data.getCourse('nope')).toBeNull();
  });

  it('skips a course it cannot read, so the rest of the catalogue still loads', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    store.queryDocs = [
      { id: 'broken', data: () => ({ ...course(), id: 'broken', title: '' }) },
      { id: 'git', data: () => course() },
    ];
    expect((await data.listCourses()).map((c) => c.id)).toEqual(['git']);
    store.docs.set('courses/broken', { schemaVersion: 'one' });
    expect(await data.getCourse('broken')).toBeNull();
    expect(warn).toHaveBeenCalledWith('Unreadable course skipped', { courseId: 'broken' });
    warn.mockRestore();
  });

  it('opens a course whose lesson holds a block this app does not know', async () => {
    const lessonOf = (c: { chapters: { items: { type: string }[] }[] } | null) =>
      c?.chapters[0]?.items.find((i) => i.type === 'lesson') as { blocks: unknown[] } | undefined;
    const c = course();
    const lesson = lessonOf(c);
    if (lesson) lesson.blocks = [{ type: 'poll', id: 'b-poll' }];
    store.docs.set('courses/git', c);
    expect(lessonOf(await data.getCourse('git'))?.blocks).toEqual([
      { type: 'unsupported', id: 'b-poll' },
    ]);
  });

  it('maps assignments to plain rows', async () => {
    store.queryDocs = [
      {
        id: 'a1',
        data: () => ({
          courseId: 'git',
          dueAt: ts(5),
          mandatory: true,
          status: 'started',
          assignedByName: 'Kavya Rao',
        }),
      },
      { id: 'a2', data: () => ({ courseId: 'sql', dueAt: null, status: 'assigned' }) },
    ];
    expect(await data.myAssignments('u')).toEqual([
      {
        id: 'a1',
        courseId: 'git',
        dueAt: new Date(5),
        mandatory: true,
        status: 'started',
        assignedByName: 'Kavya Rao',
      },
      {
        id: 'a2',
        courseId: 'sql',
        dueAt: null,
        mandatory: false,
        status: 'assigned',
        assignedByName: null,
      },
    ]);
  });

  it('maps progress, filling defaults for a bare document', async () => {
    store.queryDocs = [
      {
        id: 'u_git',
        data: () => ({
          courseId: 'git',
          courseVersion: 2,
          lastItemId: 'l2',
          lastActiveAt: ts(7),
          completedItemIds: ['l1'],
          quiz: { q: { best: 1, passed: true, attempts: 1, lastAttemptAt: ts(3) }, r: {} },
          percent: 40,
          completedAt: ts(9),
          certificateId: 'NSG-GIT-26-0001',
        }),
      },
      { id: 'u_sql', data: () => ({ courseId: 'sql' }) },
    ];
    const [full, bare] = await data.myProgress('u');
    expect(full).toMatchObject({
      courseVersion: 2,
      percent: 40,
      completedAt: new Date(9),
      certificateId: 'NSG-GIT-26-0001',
    });
    expect(bare).toEqual({
      courseId: 'sql',
      courseVersion: 0,
      lastItemId: null,
      lastActiveAt: null,
      completedItemIds: [],
      quiz: {},
      percent: 0,
      completedAt: null,
      certificateId: null,
    });
  });

  it('watches one progress document, reporting null when it does not exist', () => {
    const cb = vi.fn();
    data.watchProgress('u', 'git', cb);
    store.snapCb?.({ exists: () => false });
    store.snapCb?.({ exists: () => true, data: () => ({ courseId: 'git' }) });
    expect(cb).toHaveBeenNthCalledWith(1, null);
    expect(cb.mock.calls[1]?.[0]).toMatchObject({ courseId: 'git' });
  });

  it('reads one certificate, or null, and lists mine with defaults filled', async () => {
    store.docs.set('certificates/NSG-GIT-26-0001', {});
    const raw = {
      uid: 'u',
      learnerName: 'Priya',
      courseId: 'git',
      courseTitle: 'Git',
      courseVersion: 2,
      issuedAt: ts(5),
      signatoryName: 'K',
      signatoryRole: 'R',
      revoked: true,
      revokedAt: ts(9),
    };
    store.docs.set('certificates/X', raw);
    expect(await data.getCertificate('nope')).toBeNull();
    expect(await data.getCertificate('X')).toMatchObject({
      id: 'X',
      learnerName: 'Priya',
      revoked: true,
      issuedAt: new Date(5),
      revokedAt: new Date(9),
    });
    store.docs.set('certificates/Z', { ...raw, revokedAt: undefined });
    expect(await data.getCertificate('Z')).toMatchObject({ revoked: true, revokedAt: null });
    store.docs.set('certificates/V', { ...raw, revoked: false, revokedAt: ts(9) });
    expect(await data.getCertificate('V')).toMatchObject({ revoked: false, revokedAt: null });
    store.queryDocs = [
      {
        id: 'Y',
        data: () => ({ uid: 'u', learnerName: 'P', courseId: 'git', courseTitle: 'Git' }),
      },
    ];
    expect(await data.myCertificates('u')).toEqual([
      expect.objectContaining({
        id: 'Y',
        courseVersion: 0,
        issuedAt: new Date(0),
        signatoryName: '',
        signatoryRole: '',
        revoked: false,
      }),
    ]);
  });

  it('reads the latest attempt at one Quiz, filling defaults, or null before the first', async () => {
    expect(await data.latestAttempt('u1', 'git', 'q1')).toBeNull();
    store.queryDocs = [{ id: 'a9', data: () => ({ score: 0.5, passed: true }) }];
    expect(await data.latestAttempt('u1', 'git', 'q1')).toEqual({
      id: 'a9',
      score: 0.5,
      correctCount: 0,
      total: 0,
      passed: true,
      questionIds: [],
      answers: {},
      results: [],
    });
    const full = {
      score: 1,
      correctCount: 2,
      total: 2,
      passed: false,
      questionIds: ['k1'],
      answers: { k1: ['a'] },
      results: [{ questionId: 'k1', correct: true }],
    };
    store.queryDocs = [{ id: 'a10', data: () => ({ ...full, score: undefined }) }];
    expect(await data.latestAttempt('u1', 'git', 'q1')).toEqual({ id: 'a10', ...full, score: 0 });
  });

  it('creates progress once, and never overwrites an existing document', async () => {
    await data.startCourse('u', { id: 'git', version: 3 });
    expect(store.calls[0]).toEqual([
      'set',
      'progress/u_git',
      expect.objectContaining({
        uid: 'u',
        courseId: 'git',
        courseVersion: 3,
        percent: 0,
        completedItemIds: [],
      }),
    ]);
    store.docs.set('progress/u_git', {});
    store.calls = [];
    await data.startCourse('u', { id: 'git', version: 3 });
    expect(store.calls).toEqual([]);
  });

  it('treats a refused create as started when the document turned up meanwhile', async () => {
    const denied = Object.assign(new Error('denied'), { code: 'permission-denied' });
    store.setError = denied;
    // Another open created it first: the refusal is not a failure.
    store.createdByRival = true;
    await data.startCourse('u', { id: 'git', version: 3 });
    store.docs.clear();
    store.createdByRival = false;
    // Still missing, or a different error: it is a failure.
    await expect(data.startCourse('u', { id: 'git', version: 3 })).rejects.toBe(denied);
    store.setError = new Error('offline');
    await expect(data.startCourse('u', { id: 'git', version: 3 })).rejects.toThrow('offline');
  });

  it('appends a completed lesson as a set union and moves the resume point', async () => {
    await data.completeItem('u', 'git', 'l1');
    await data.setLastItem('u', 'git', 'l2');
    expect(store.calls).toEqual([
      [
        'update',
        'progress/u_git',
        { completedItemIds: { union: 'l1' }, lastItemId: 'l1', lastActiveAt: 'NOW' },
      ],
      ['update', 'progress/u_git', { lastItemId: 'l2', lastActiveAt: 'NOW' }],
    ]);
  });

  it('reads the org teams, empty when none are saved', async () => {
    expect(await data.orgTeams()).toEqual([]);
    store.docs.set('config/org', { domain: 'nonstopio.com' });
    expect(await data.orgTeams()).toEqual([]);
    store.docs.set('config/org', { domain: 'nonstopio.com', teams: ['QA', 'Dev'] });
    expect(await data.orgTeams()).toEqual(['QA', 'Dev']);
  });

  it('writes only the label set to my profile', async () => {
    await data.setLabels('u', 'gurukul');
    expect(store.calls).toEqual([['update', 'users/u', { labels: 'gurukul' }]]);
  });
});
