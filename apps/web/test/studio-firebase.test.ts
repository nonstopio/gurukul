import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listing, makeCourse } from './fake-data';

const store = vi.hoisted(() => ({
  docs: new Map<string, unknown>(),
  queue: [] as Array<Array<{ id: string; data: () => unknown }>>,
  queries: [] as unknown[][],
  writes: [] as unknown[][],
  /** What a count answers: a number, or an error to throw. */
  count: 7 as number | Error,
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
    if (store.count instanceof Error) throw store.count;
    return { data: () => ({ count: store.count }) };
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
  updateDoc: async (ref: { path: string }, data: unknown) => {
    store.writes.push(['update', ref.path, data]);
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

import { COURSE_TTL_MS } from '../src/data/firebase';
import { DraftConflictError } from '../src/studio/errors';
import { cleanForFirestore, firebaseStudioData } from '../src/studio/firebase';

let data = firebaseStudioData({} as never);
const ts = (ms: number) => ({ toDate: () => new Date(ms), toMillis: () => ms });
const live = (id: string, educatorIds: string[] = [], over: object = {}) => ({
  ...makeCourse({ id, educatorIds }),
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
  store.count = 7;
  data = firebaseStudioData({} as never);
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

describe('listLiveCourses', () => {
  it('reads the summary of every course, and no course, draft or stats document', async () => {
    store.queue = [Array.from({ length: 7 }, (_, i) => d(`c${i}`, listing(live(`c${i}`, ['u1']))))];
    store.docs.set('courses/c1/drafts/current', draft());
    const rows = await data.listLiveCourses();
    expect(rows).toHaveLength(7);
    expect(rows[0]).not.toHaveProperty('description');
    // One query of the summaries and one count of the courses: no filter, so drafts are included.
    expect(store.queries).toEqual([
      [{ collection: 'courseSummaries' }, { limit: 1000 }],
      [{ collection: 'courses' }],
    ]);
  });
});

describe('the course list remembered for five minutes', () => {
  const summaries = () => [d('git', listing(live('git', ['u1'])))];
  // One summaries query and one count of the courses each time the list is really read.
  const reads = () => store.queries.length / 2;
  beforeEach(() => {
    store.count = 1;
  });
  afterEach(() => vi.useRealTimers());

  it('asks once within the time and again after it', async () => {
    vi.useFakeTimers();
    store.queue = [summaries(), summaries()];
    const first = await data.listLiveCourses();
    expect(await data.listLiveCourses()).toBe(first);
    expect(reads()).toBe(1);
    vi.advanceTimersByTime(COURSE_TTL_MS + 1);
    await data.listLiveCourses();
    expect(reads()).toBe(2);
  });

  it('does not keep a failed read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const getDocs = vi.spyOn(await import('firebase/firestore'), 'getDocs');
    // The summaries fail, and so do the whole courses read in their place.
    getDocs.mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline'));
    await expect(data.listLiveCourses()).rejects.toThrow('offline');
    getDocs.mockRestore();
    store.queue = [summaries()];
    expect((await data.listLiveCourses()).map((c) => c.id)).toEqual(['git']);
    warn.mockRestore();
  });

  it('is dropped by forgetCourses', async () => {
    store.queue = [summaries(), summaries()];
    await data.listLiveCourses();
    await data.forgetCourses();
    await data.listLiveCourses();
    expect(reads()).toBe(2);
  });

  it('is dropped by a saved draft, but not by one that conflicts', async () => {
    store.queue = [summaries(), summaries()];
    store.docs.set('courses/git/drafts/current', draft(3));
    await data.listLiveCourses();
    await expect(
      data.saveDraft('git', { course: makeCourse(), answers: {} }, 1, 'u1'),
    ).rejects.toBeInstanceOf(DraftConflictError);
    await data.listLiveCourses();
    expect(reads()).toBe(1);
    await data.saveDraft('git', { course: makeCourse(), answers: {} }, 3, 'u1');
    await data.listLiveCourses();
    expect(reads()).toBe(2);
  });

  it('reads the whole courses when a summary is missing, so an Educator never loses a course', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    store.count = 2;
    store.queue = [
      summaries(),
      [d('git', live('git', ['u1'])), d('new', live('new', ['u1'], { status: 'draft' }))],
    ];
    expect((await data.listLiveCourses()).map((c) => c.id).sort()).toEqual(['git', 'new']);
    expect(warn).toHaveBeenCalledWith('Course summaries incomplete, whole courses read', {
      count: 1,
      expected: 2,
    });
    warn.mockRestore();
  });
});

describe('courseFacts, for one card of a course the person may edit', () => {
  it('says the draft has unpublished edits from a count, reading no draft, and counts the learners', async () => {
    store.count = 1;
    store.docs.set('stats/course_git', { started: 9 });
    const publishedAt = ts(5);
    expect(await data.courseFacts('git', publishedAt)).toEqual({ edited: true, learners: 9 });
    expect(store.queries).toEqual([
      [{ collection: 'courses/git/drafts' }, { where: ['updatedAt', '>', publishedAt] }],
    ]);
    store.count = 0;
    expect(await data.courseFacts('sql', ts(5))).toEqual({ edited: false, learners: 0 });
  });

  it('asks nothing about the draft of a course never published', async () => {
    expect(await data.courseFacts('new', null)).toEqual({ edited: false, learners: 0 });
    expect(store.queries).toEqual([]);
  });

  it('gives null for what it cannot read, and still the rest', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    store.count = new Error('denied');
    store.docs.set('stats/course_git', new Error('denied'));
    expect(await data.courseFacts('git', ts(5))).toEqual({ edited: null, learners: null });
    expect(warn).toHaveBeenCalledWith('Reading the draft state failed', { courseId: 'git' });
    warn.mockRestore();
  });

  it('is remembered per course, and dropped with the list', async () => {
    store.count = 0;
    const first = data.courseFacts('git', ts(5));
    expect(data.courseFacts('git', ts(5))).toBe(first);
    expect(data.courseFacts('sql', ts(5))).not.toBe(first);
    await data.forgetCourses();
    expect(data.courseFacts('git', ts(5))).not.toBe(first);
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
    expect(await data.getDraft('bare')).not.toHaveProperty('answersChanged');
    store.docs.set('courses/keys/drafts/current', { ...draft(), answersChanged: true });
    expect((await data.getDraft('keys'))?.answersChanged).toBe(true);
  });

  it('loads a draft that would not pass the strict course schema, but not one that is not a course', async () => {
    const wip = { ...makeCourse(), title: '', summary: '', publishedAt: null };
    store.docs.set('courses/wip/drafts/current', { rev: 2, course: wip, answers: {} });
    expect((await data.getDraft('wip'))?.course.title).toBe('');
    for (const bad of [null, 'text', {}, { chapters: 'x' }]) {
      store.docs.set('courses/bad/drafts/current', { rev: 1, course: bad });
      await expect(data.getDraft('bad')).rejects.toThrow('not a course');
    }
  });

  it('saves with the next rev, cleaning undefined fields', async () => {
    store.docs.set('courses/git/drafts/current', { ...draft(3), answers: {} });
    const course = { ...makeCourse(), kindLabel: undefined } as never;
    expect(await data.saveDraft('git', { course, answers: {} }, 3, 'u1')).toBe(4);
    expect(store.writes[0]).toEqual([
      'update',
      'courses/git/drafts/current',
      expect.objectContaining({ rev: 4, updatedAt: 'NOW', updatedBy: 'u1', answers: {} }),
    ]);
    expect(JSON.stringify(store.writes[0])).not.toContain('kindLabel');
    expect(JSON.stringify(store.writes[0])).not.toContain('answersChanged');
  });

  it('marks answersChanged when the keys differ from the stored ones, or the stored draft is marked', async () => {
    store.docs.set('courses/git/drafts/current', draft(3));
    const edited = { course: makeCourse(), answers: { q1: { k1: ['b'] } } };
    await data.saveDraft('git', edited, 3, 'u1');
    expect(store.writes[0]?.[2]).toMatchObject({ answersChanged: true });
    store.docs.set('courses/git/drafts/current', { ...draft(3), answersChanged: true });
    await data.saveDraft('git', { course: makeCourse(), answers: draft().answers }, 3, 'u1');
    expect(store.writes[1]?.[2]).toMatchObject({ answersChanged: true });
  });

  it('does not write back a mark a publish removed: keys equal to the stored ones save unmarked', async () => {
    // This tab loaded the draft while it was marked; a publish since removed the mark (rev unchanged).
    store.docs.set('courses/git/drafts/current', draft(3));
    const work = { course: makeCourse(), answers: draft().answers, answersChanged: true as const };
    await data.saveDraft('git', work, 3, 'u1');
    expect(JSON.stringify(store.writes[0])).not.toContain('answersChanged');
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
  it('lists, adds, edits and removes questions', async () => {
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
    await data.updateInBank('b1', {
      question: { id: 'k1', note: undefined } as never,
      answers: ['b'],
      tags: ['sql'],
    });
    expect(store.writes[1]).toEqual([
      'update',
      'questionBank/b1',
      { question: { id: 'k1' }, answers: ['b'], tags: ['sql'] },
    ]);
    await data.removeFromBank('b1');
    expect(store.writes[2]).toEqual(['delete', 'questionBank/b1']);
  });

  it('counts the learners who completed a lesson with one count query', async () => {
    expect(await data.completedCount('git', 'l1')).toBe(7);
    expect(store.queries.at(-1)).toContainEqual({ where: ['courseId', '==', 'git'] });
    expect(store.queries.at(-1)).toContainEqual({
      where: ['completedItemIds', 'array-contains', 'l1'],
    });
  });

  it('reads who may open a course, public when it says nothing', async () => {
    store.docs.set('courses/git', { visibility: 'teams', visibleTeamIds: ['qa'] });
    expect(await data.getAccess('git')).toEqual({ visibility: 'teams', visibleTeamIds: ['qa'] });
    store.docs.set('courses/old', {});
    expect(await data.getAccess('old')).toEqual({ visibility: 'public', visibleTeamIds: [] });
  });
});
