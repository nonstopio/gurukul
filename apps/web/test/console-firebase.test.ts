import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  docs: new Map<string, unknown>(),
  queue: [] as Array<Array<{ id: string; data: () => unknown }>>,
  queries: [] as unknown[][],
  count: 0,
}));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ collection: name }),
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  documentId: () => '__name__',
  getCountFromServer: async () => ({ data: () => ({ count: store.count }) }),
  getDoc: async (ref: { path: string }) => ({
    exists: () => store.docs.has(ref.path),
    data: () => store.docs.get(ref.path),
  }),
  getDocs: async (q: { parts: unknown[] }) => {
    store.queries.push(q.parts);
    const docs = store.queue.shift() ?? [];
    return { docs, empty: docs.length === 0 };
  },
  limit: (n: number) => ({ limit: n }),
  orderBy: (f: string, d?: string) => ({ orderBy: [f, d] }),
  query: (...parts: unknown[]) => ({ parts }),
  startAfter: (v: string) => ({ startAfter: v }),
  where: (f: string, op: string, v: unknown) => ({ where: [f, op, v] }),
}));

import { firebaseConsoleData } from '../src/console/firebase';

const data = firebaseConsoleData({} as never);
const ts = (ms: number) => ({ toDate: () => new Date(ms), toMillis: () => ms });
const d = (id: string, v: unknown) => ({ id, data: () => v });
const user = (n: number) =>
  d(`u${n}`, {
    email: `u${n}@nonstopio.com`,
    displayName: `U${n}`,
    team: 'QA',
    roles: ['shishya', 'acharya'],
    grantedCourseIds: ['git'],
    createdAt: ts(5),
  });

beforeEach(() => {
  store.docs.clear();
  store.queue = [];
  store.queries = [];
  store.count = 0;
});

describe('stats and config', () => {
  it('parses stats documents, filling defaults when they do not exist yet', async () => {
    expect(await data.orgStats()).toMatchObject({ started: 0, weekly: {} });
    store.docs.set('stats/org', { started: 4, weekly: { '2026-W44': 9 } });
    expect(await data.orgStats()).toMatchObject({ started: 4, weekly: { '2026-W44': 9 } });
    expect(await data.courseStats('git')).toMatchObject({ assigned: 0 });
    store.docs.set('stats/course_git', { assigned: 7, parvaCompletions: [5, 3] });
    expect(await data.courseStats('git')).toMatchObject({ assigned: 7, parvaCompletions: [5, 3] });
  });

  it('reads the teams list, empty when there is no config or no teams', async () => {
    expect(await data.teams()).toEqual([]);
    store.docs.set('config/org', {});
    expect(await data.teams()).toEqual([]);
    store.docs.set('config/org', { teams: ['QA', 'Dev'] });
    expect(await data.teams()).toEqual(['QA', 'Dev']);
  });
});

describe('assignments', () => {
  const a = d('a1', {
    email: 'a@nonstopio.com',
    uid: null,
    courseId: 'git',
    dueAt: ts(9),
    assignedAt: ts(3),
    mandatory: true,
    status: 'assigned',
  });
  it('lists one course, or the newest across all, with dates as Date', async () => {
    store.queue = [
      [a],
      [d('a2', { email: 'b@nonstopio.com', courseId: 'sql', status: 'started' })],
    ];
    expect(await data.assignments({ courseId: 'git' })).toEqual([
      {
        id: 'a1',
        email: 'a@nonstopio.com',
        uid: null,
        courseId: 'git',
        dueAt: new Date(9),
        assignedAt: new Date(3),
        mandatory: true,
        status: 'assigned',
      },
    ]);
    expect(store.queries[0]).toContainEqual({ where: ['courseId', '==', 'git'] });
    expect(await data.assignments()).toEqual([
      {
        id: 'a2',
        email: 'b@nonstopio.com',
        uid: null,
        courseId: 'sql',
        dueAt: null,
        assignedAt: null,
        mandatory: false,
        status: 'started',
      },
    ]);
    expect(store.queries[1]).toContainEqual({ orderBy: ['assignedAt', 'desc'] });
  });
});

describe('users', () => {
  it('pages through people, giving a cursor only when more remain', async () => {
    store.queue = [[user(1), user(2), user(3)]];
    const first = await data.usersPage(null, 2);
    expect(first.rows.map((r) => r.uid)).toEqual(['u1', 'u2']);
    expect(first.nextCursor).toBe('u2@nonstopio.com');
    store.queue = [[user(3)]];
    const last = await data.usersPage('u2@nonstopio.com', 2);
    expect(last).toMatchObject({ nextCursor: null });
    expect(store.queries[1]).toContainEqual({ startAfter: 'u2@nonstopio.com' });
    store.queue = [[]];
    expect(await data.usersPage(null, 2)).toEqual({ rows: [], nextCursor: null });
  });

  it('lists the people who hold a granted role', async () => {
    store.queue = [[user(1)]];
    expect((await data.usersWithRole('acharya')).map((u) => u.uid)).toEqual(['u1']);
    expect(store.queries[0]).toContainEqual({ where: ['roles', 'array-contains', 'acharya'] });
  });

  it('fills defaults for a bare profile and counts people', async () => {
    store.queue = [[d('u9', {})]];
    expect((await data.usersPage(null, 5)).rows[0]).toEqual({
      uid: 'u9',
      email: '',
      displayName: '',
      team: null,
      roles: ['shishya'],
      grantedCourseIds: [],
      createdAt: null,
    });
    store.count = 148;
    expect(await data.userCount()).toBe(148);
  });

  it('searches by email prefix and lists a team', async () => {
    store.queue = [[user(1)], [user(2)]];
    expect((await data.searchUsers('  U1 ')).map((u) => u.uid)).toEqual(['u1']);
    expect(store.queries[0]).toContainEqual({ where: ['email', '>=', 'u1'] });
    expect((await data.usersInTeam('QA'))[0]?.team).toBe('QA');
  });

  it('reads profiles by uid in chunks of 30', async () => {
    const uids = Array.from({ length: 31 }, (_, i) => `u${i}`);
    store.queue = [[user(1)], [user(30)]];
    expect((await data.usersByUid(uids)).map((u) => u.uid)).toEqual(['u1', 'u30']);
    expect(store.queries).toHaveLength(2);
    expect(store.queries[1]).toContainEqual({ where: ['__name__', 'in', ['u30']] });
  });
});

describe('progress, certificates and known emails', () => {
  it('fetches progress for many people in chunks of 30', async () => {
    const uids = Array.from({ length: 31 }, (_, i) => `u${i}`);
    store.queue = [
      [d('p1', { uid: 'u1', courseId: 'git' })],
      [d('p2', { uid: 'u30', courseId: 'git' })],
    ];
    const rows = await data.progressFor(uids);
    expect(rows.map((r) => r.uid)).toEqual(['u1', 'u30']);
    expect(store.queries).toHaveLength(2);
    store.queue = [];
    expect(await data.progressFor([])).toEqual([]);
  });

  it('lists a person’s certificates', async () => {
    store.queue = [
      [
        d('NSG-1', {
          uid: 'u1',
          learnerName: 'P',
          courseId: 'git',
          courseTitle: 'Git',
          issuedAt: ts(1),
        }),
      ],
    ];
    expect((await data.certificatesFor('u1'))[0]?.id).toBe('NSG-1');
  });

  it('finds who has signed in and who already holds EVERY selected course', async () => {
    store.queue = [
      [d('u1', { email: 'a@nonstopio.com' })],
      [d('x', { email: 'a@nonstopio.com' }), d('y', { email: 'b@nonstopio.com' })],
      [d('z', { email: 'a@nonstopio.com' })],
    ];
    const known = await data.knownEmails(['a@nonstopio.com', 'b@nonstopio.com'], ['git', 'sql']);
    expect([...known.signedIn]).toEqual(['a@nonstopio.com']);
    expect([...known.assigned]).toEqual(['a@nonstopio.com']);
    expect(await data.knownEmails([], ['git'])).toEqual({
      signedIn: new Set(),
      assigned: new Set(),
    });
  });

  it('reads the newest audit entries and resolves each doer to an email once', async () => {
    store.docs.set('users/boss', { email: 'boss@nonstopio.com' });
    store.queue = [
      [
        d('a1', { action: 'assign', by: 'boss', target: 'git', at: ts(9) }),
        d('a2', { action: 'roles.set', by: 'boss' }),
        d('a3', { action: 'course.publish', by: 'gone', at: ts(1) }),
      ],
    ];
    const rows = await data.auditLog();
    expect(store.queries[0]).toContainEqual({ orderBy: ['at', 'desc'] });
    expect(store.queries[0]).toContainEqual({ limit: 100 });
    expect(rows.map((r) => [r.by, r.target, r.at?.getTime() ?? null])).toEqual([
      ['boss@nonstopio.com', 'git', 9],
      ['boss@nonstopio.com', null, null],
      ['gone', null, 1],
    ]);
  });
});
