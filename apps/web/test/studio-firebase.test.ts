import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCourse } from './fake-data';

const store = vi.hoisted(() => ({
  docs: new Map<string, unknown>(),
  queue: [] as Array<Array<{ id: string; data: () => unknown }>>,
  queries: [] as unknown[][],
  writes: [] as unknown[][],
}));

vi.mock('firebase/firestore', () => ({
  addDoc: async (_c: unknown, data: unknown) => {
    store.writes.push(['add', data]);
    return { id: 'new-id' };
  },
  collection: (_db: unknown, ...path: string[]) => ({ collection: path.join('/') }),
  deleteDoc: async (ref: { path: string }) => {
    store.writes.push(['delete', ref.path]);
  },
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  getCountFromServer: async (q: { parts: unknown[] }) => {
    store.queries.push(q.parts);
    return { data: () => ({ count: 7 }) };
  },
  getDoc: async (ref: { path: string }) => {
    if (store.docs.get(ref.path) instanceof Error) throw store.docs.get(ref.path);
    return {
      exists: () => store.docs.has(ref.path),
      data: () => store.docs.get(ref.path),
    };
  },
  getDocs: async (q: { parts: unknown[] }) => {
    store.queries.push(q.parts);
    const docs = store.queue.shift() ?? [];
    return { docs };
  },
  limit: (n: number) => ({ limit: n }),
  orderBy: (f: string, d?: string) => ({ orderBy: [f, d] }),
  query: (...parts: unknown[]) => ({ parts }),
  runTransaction: async (_db: unknown, fn: (tx: unknown) => unknown) =>
    fn({
      get: async (ref: { path: string }) => ({
        exists: () => store.docs.has(ref.path),
        data: () => store.docs.get(ref.path),
      }),
      update: (ref: { path: string }, data: unknown) =>
        store.writes.push(['update', ref.path, data]),
    }),
  serverTimestamp: () => 'NOW',
  where: (f: string, op: string, v: unknown) => ({ where: [f, op, v] }),
}));

import { DraftConflictError } from '../src/studio/errors';
import { cleanForFirestore, firebaseStudioData } from '../src/studio/firebase';

const data = firebaseStudioData({} as never);
const ts = (ms: number) => ({ toDate: () => new Date(ms), toMillis: () => ms });
const live = (id: string, acharyaIds: string[] = [], over: object = {}) => ({
  ...makeCourse({ id, acharyaIds }),
  publishedAt: ts(1),
  ...over,
});
const d = (id: string, v: unknown) => ({ id, data: () => v });
const draft = (rev = 3) => ({
  rev,
  updatedAt: ts(7),
  updatedBy: 'u1',
  course: { ...makeCourse(), publishedAt: ts(1) },
  answers: { q1: { k1: ['a'] } },
});

beforeEach(() => {
  store.docs.clear();
  store.queue = [];
  store.queries = [];
  store.writes = [];
});

describe('cleanForFirestore', () => {
  it('drops undefined fields at any depth and keeps Timestamps, nulls and arrays', () => {
    const stamp = ts(1);
    expect(
      cleanForFirestore({
        a: 1,
        b: undefined,
        c: [{ d: undefined, e: 2 }],
        f: stamp,
        g: null,
        h: 'x',
      }),
    ).toEqual({
      a: 1,
      c: [{ e: 2 }],
      f: stamp,
      g: null,
      h: 'x',
    });
  });
});

describe('listCourses', () => {
  it('lets a Kulapati see everything and reads the draft of each course', async () => {
    store.queue = [[d('git', live('git')), d('sql', live('sql', ['u9']))]];
    store.docs.set('courses/git/drafts/current', draft());
    const rows = await data.listCourses('k1', true);
    expect(rows.map((r) => [r.live.id, r.draft?.rev ?? null])).toEqual([
      ['git', 3],
      ['sql', null],
    ]);
    expect(store.queries).toHaveLength(1);
  });

  it('shows an Acharya every course, unpublished ones too, reading drafts only where they may edit', async () => {
    store.queue = [
      [
        d('git', live('git', ['u1'])),
        d('sql', live('sql', ['u9'])),
        d('mine', live('mine', ['u1'], { status: 'draft' })),
        d('theirs', live('theirs', ['u9'], { status: 'draft' })),
      ],
    ];
    store.docs.set('courses/git/drafts/current', draft(2));
    store.docs.set('courses/theirs/drafts/current', draft(5));
    const rows = await data.listCourses('u1', false);
    expect(rows.map((r) => r.live.id)).toEqual(['git', 'sql', 'mine', 'theirs']);
    expect(rows.find((r) => r.live.id === 'git')?.draft?.rev).toBe(2);
    expect(rows.find((r) => r.live.id === 'sql')?.draft).toBeNull();
    expect(rows.find((r) => r.live.id === 'mine')?.draft).toBeNull();
    expect(rows.find((r) => r.live.id === 'theirs')?.draft).toBeNull();
    expect(store.queries).toHaveLength(1);
    expect(store.queries[0]).not.toContainEqual(
      expect.objectContaining({ where: expect.anything() }),
    );
  });

  it('adds the learners who started a course the person may edit, and nothing for the rest', async () => {
    store.queue = [
      [d('git', live('git', ['u1'])), d('sql', live('sql', ['u9'])), d('new', live('new', ['u1']))],
    ];
    store.docs.set('stats/course_git', { started: 9 });
    const rows = await data.listCourses('u1', false);
    expect(rows.map((r) => r.learners)).toEqual([9, undefined, 0]);
  });

  it('leaves the learner count out when the stats cannot be read', async () => {
    store.queue = [[d('git', live('git', ['u1']))]];
    store.docs.set('stats/course_git', new Error('denied'));
    const rows = await data.listCourses('u1', false);
    expect(rows[0]).not.toHaveProperty('learners');
  });

  it('skips a live course it cannot read instead of failing the whole list', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    store.queue = [[d('broken', { ...live('broken'), schemaVersion: 0 }), d('git', live('git'))]];
    const rows = await data.listCourses('k1', true);
    expect(rows.map((r) => r.live.id)).toEqual(['git']);
    expect(warn).toHaveBeenCalledWith('Unreadable course skipped', { courseId: 'broken' });
    warn.mockRestore();
  });
});

describe('drafts', () => {
  it('reads a draft with defaults for missing fields, or null', async () => {
    expect(await data.getDraft('git')).toBeNull();
    store.docs.set('courses/git/drafts/current', draft());
    expect(await data.getDraft('git')).toMatchObject({
      rev: 3,
      updatedAt: new Date(7),
      updatedBy: 'u1',
      answers: { q1: { k1: ['a'] } },
    });
    store.docs.set('courses/bare/drafts/current', {
      course: { ...makeCourse(), publishedAt: ts(1) },
    });
    expect(await data.getDraft('bare')).toMatchObject({
      rev: 0,
      updatedAt: null,
      updatedBy: '',
      answers: {},
    });
  });

  it('loads a draft that would not pass the strict course schema, but not one that is not a course', async () => {
    const wip = { ...makeCourse(), title: '', summary: '', publishedAt: null };
    store.docs.set('courses/wip/drafts/current', { rev: 2, course: wip, answers: {} });
    expect((await data.getDraft('wip'))?.course.title).toBe('');
    for (const bad of [null, 'text', {}, { parvas: 'x' }]) {
      store.docs.set('courses/bad/drafts/current', { rev: 1, course: bad });
      await expect(data.getDraft('bad')).rejects.toThrow('not a course');
    }
  });

  it('saves with the next rev, cleaning undefined fields', async () => {
    store.docs.set('courses/git/drafts/current', draft(3));
    const course = { ...makeCourse(), kindLabel: undefined } as never;
    expect(await data.saveDraft('git', { course, answers: {} }, 3, 'u1')).toBe(4);
    expect(store.writes[0]).toEqual([
      'update',
      'courses/git/drafts/current',
      expect.objectContaining({ rev: 4, updatedAt: 'NOW', updatedBy: 'u1', answers: {} }),
    ]);
    expect(JSON.stringify(store.writes[0])).not.toContain('kindLabel');
  });

  it('refuses to save over a draft that moved on, or that is gone', async () => {
    store.docs.set('courses/git/drafts/current', draft(5));
    await expect(
      data.saveDraft('git', { course: makeCourse(), answers: {} }, 3, 'u1'),
    ).rejects.toBeInstanceOf(DraftConflictError);
    await expect(
      data.saveDraft('none', { course: makeCourse(), answers: {} }, 1, 'u1'),
    ).rejects.toBeInstanceOf(DraftConflictError);
    expect(store.writes).toEqual([]);
  });
});

describe('versions', () => {
  it('lists versions newest first and reads one snapshot, or null', async () => {
    store.queue = [
      [
        d('3', { version: 3, publishedAt: ts(9), course: { title: 'Git' } }),
        d('2', { version: 2 }),
      ],
    ];
    expect(await data.listVersions('git')).toEqual([
      { version: 3, publishedAt: new Date(9), title: 'Git' },
      { version: 2, publishedAt: null, title: '' },
    ]);
    store.docs.set('courses/git/versions/3', { course: { ...makeCourse(), publishedAt: ts(1) } });
    expect((await data.getVersion('git', 3))?.title).toBe('Git, the NonStop Way');
    expect(await data.getVersion('git', 9)).toBeNull();
  });
});

describe('question bank', () => {
  it('lists, adds and removes questions', async () => {
    store.queue = [
      [
        d('b1', { question: { id: 'k1' }, answers: ['a'], tags: ['git'], createdBy: 'u1' }),
        d('b2', {}),
      ],
    ];
    expect(await data.questionBank()).toEqual([
      { id: 'b1', question: { id: 'k1' }, answers: ['a'], tags: ['git'], createdBy: 'u1' },
      { id: 'b2', question: undefined, answers: [], tags: [], createdBy: '' },
    ]);
    const id = await data.addToBank(
      { question: { id: 'k1', note: undefined } as never, answers: ['a'], tags: [] },
      'u1',
    );
    expect(id).toBe('new-id');
    expect(store.writes[0]).toEqual([
      'add',
      { question: { id: 'k1' }, answers: ['a'], tags: [], createdBy: 'u1', createdAt: 'NOW' },
    ]);
    await data.removeFromBank('b1');
    expect(store.writes[1]).toEqual(['delete', 'questionBank/b1']);
  });

  it('counts the learners who completed a lesson with one count query', async () => {
    expect(await data.completedCount('git', 'l1')).toBe(7);
    expect(store.queries.at(-1)).toContainEqual({ where: ['courseId', '==', 'git'] });
    expect(store.queries.at(-1)).toContainEqual({
      where: ['completedItemIds', 'array-contains', 'l1'],
    });
  });
});
