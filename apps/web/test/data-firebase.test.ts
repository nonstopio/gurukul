import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCourse } from './fake-data';

const store = vi.hoisted(() => ({
  docs: new Map<string, unknown>(),
  queryDocs: [] as Array<{ id: string; data: () => unknown }>,
  snapCb: undefined as undefined | ((s: unknown) => void),
  calls: [] as unknown[][],
}));

vi.mock('firebase/firestore', () => ({
  arrayUnion: (v: string) => ({ union: v }),
  collection: (_db: unknown, name: string) => ({ collection: name }),
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  getDoc: async (ref: { path: string }) => ({
    exists: () => store.docs.has(ref.path),
    data: () => store.docs.get(ref.path),
  }),
  getDocs: async () => ({ docs: store.queryDocs }),
  limit: (n: number) => ({ limit: n }),
  onSnapshot: (_ref: unknown, cb: (s: unknown) => void) => {
    store.snapCb = cb;
    return () => {};
  },
  orderBy: (f: string, d: string) => ({ orderBy: [f, d] }),
  query: (...parts: unknown[]) => ({ parts }),
  serverTimestamp: () => 'NOW',
  setDoc: async (ref: { path: string }, data: unknown) => {
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
});

describe('firebaseLearnerData', () => {
  it('lists courses through the schema', async () => {
    store.queryDocs = [{ id: 'git', data: () => course() }];
    expect((await data.listCourses()).map((c) => c.id)).toEqual(['git']);
  });

  it('gets one course, or null when it is missing', async () => {
    store.docs.set('courses/git', course());
    expect((await data.getCourse('git'))?.title).toBe('Git, the NonStop Way');
    expect(await data.getCourse('nope')).toBeNull();
  });

  it('maps assignments to plain rows', async () => {
    store.queryDocs = [
      {
        id: 'a1',
        data: () => ({ courseId: 'git', dueAt: ts(5), mandatory: true, status: 'started' }),
      },
      { id: 'a2', data: () => ({ courseId: 'sql', dueAt: null, status: 'assigned' }) },
    ];
    expect(await data.myAssignments('u')).toEqual([
      { id: 'a1', courseId: 'git', dueAt: new Date(5), mandatory: true, status: 'started' },
      { id: 'a2', courseId: 'sql', dueAt: null, mandatory: false, status: 'assigned' },
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
          pariksha: { q: { best: 1, passed: true, attempts: 1 } },
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
      pariksha: {},
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
});
