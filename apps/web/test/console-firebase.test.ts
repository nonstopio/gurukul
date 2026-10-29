import { DEFAULT_ORG_CONFIG } from '@gurukul/schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  docs: new Map<string, unknown>(),
  queue: [] as Array<Array<{ id: string; data: () => unknown }>>,
  queries: [] as unknown[][],
  count: 0,
}));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...path: string[]) => ({ collection: path.join('/') }),
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  documentId: () => '__name__',
  getCountFromServer: async (q: { parts?: unknown[] }) => {
    if (q.parts) store.queries.push(q.parts);
    return { data: () => ({ count: store.count }) };
  },
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
  setDoc: async (ref: { path: string }, value: unknown) => {
    store.docs.set(ref.path, value);
  },
  startAfter: (...v: unknown[]) => ({ startAfter: v }),
  where: (f: string, op: string, v: unknown) => ({ where: [f, op, v] }),
}));

import { makeCourse } from './fake-data';
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

  it('reads org settings over the defaults, and saves the whole document', async () => {
    expect(await data.orgSettings()).toEqual(DEFAULT_ORG_CONFIG);
    store.docs.set('config/org', { domain: 'nonstopio.com', teams: ['QA'] });
    expect(await data.orgSettings()).toMatchObject({
      teams: ['QA'],
      reminders: { enabled: false },
    });
    const settings = {
      domain: 'nonstopio.com',
      teams: ['QA', 'Dev'],
      reminders: { enabled: true },
      signatory: { name: 'Ravi Sample', role: 'Dean' },
    };
    await data.saveOrgSettings(settings);
    expect(store.docs.get('config/org')).toEqual(settings);
    expect(await data.orgSettings()).toEqual(settings);
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

  it('reads every pending and every overdue assignment, each once', async () => {
    const now = new Date(10);
    const b = d('a2', { email: 'b@nonstopio.com', uid: 'u2', courseId: 'git', status: 'started' });
    store.queue = [[a], [a, b]];
    expect((await data.openAssignments(now)).map((x) => x.id)).toEqual(['a1', 'a2']);
    expect(store.queries[0]).toContainEqual({ where: ['uid', '==', null] });
    expect(store.queries[1]).toContainEqual({ where: ['status', 'in', ['assigned', 'started']] });
    expect(store.queries[1]).toContainEqual({ where: ['dueAt', '<', now] });
  });

  it('counts every overdue assignment with an aggregation, not loaded rows', async () => {
    const now = new Date(10);
    store.count = 731;
    expect(await data.overdueCount(now)).toBe(731);
    expect(store.queries[0]).toContainEqual({ where: ['status', 'in', ['assigned', 'started']] });
    expect(store.queries[0]).toContainEqual({ where: ['dueAt', '<', now] });
    expect(store.queries[0]).not.toContainEqual({ limit: expect.any(Number) });
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
    expect(store.queries[1]).toContainEqual({ startAfter: ['u2@nonstopio.com'] });
    store.queue = [[]];
    expect(await data.usersPage(null, 2)).toEqual({ rows: [], nextCursor: null });
  });

  it('lists the people who hold a granted role', async () => {
    store.queue = [[user(1)]];
    expect((await data.usersWithRole('acharya')).map((u) => u.uid)).toEqual(['u1']);
    expect(store.queries[0]).toContainEqual({ where: ['roles', 'array-contains', 'acharya'] });
  });

  it('lists every course, drafts included, skipping one it cannot read', async () => {
    store.queue = [
      [d('a', { ...makeCourse({ id: 'a', status: 'draft' }) }), d('b', { junk: true })],
    ];
    expect((await data.allCourses()).map((c) => c.id)).toEqual(['a']);
    expect(store.queries[0]).toContainEqual({ limit: 100 });
    expect(store.queries[0]).not.toContainEqual(
      expect.objectContaining({ where: expect.anything() }),
    );
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

  it('searches by email and by name prefix, email matches first, each person once', async () => {
    store.queue = [[user(1)], [user(2), user(1)]];
    expect((await data.searchUsers('  U1 ')).map((u) => u.uid)).toEqual(['u1', 'u2']);
    expect(store.queries[0]).toContainEqual({ where: ['email', '>=', 'u1'] });
    expect(store.queries[0]).toContainEqual({ where: ['email', '<=', 'u1\uf8ff'] });
    expect(store.queries[1]).toContainEqual({ orderBy: ['nameLower', undefined] });
    expect(store.queries[1]).toContainEqual({ where: ['nameLower', '>=', 'u1'] });
    expect(store.queries[1]).toContainEqual({ limit: 8 });
  });

  it('returns at most 8 people from a search', async () => {
    store.queue = [
      Array.from({ length: 8 }, (_, i) => user(i)),
      Array.from({ length: 8 }, (_, i) => user(i + 10)),
    ];
    expect(await data.searchUsers('u')).toHaveLength(8);
  });

  it('lists a team', async () => {
    store.queue = [[user(2)]];
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

describe('recent progress', () => {
  it('reads the 100 most recently active progress documents with their owner', async () => {
    store.queue = [[d('u1_git', { uid: 'u1', courseId: 'git' })]];
    const rows = await data.recentProgress();
    expect(rows.map((r) => [r.uid, r.courseId])).toEqual([['u1', 'git']]);
    expect(store.queries[0]).toContainEqual({ orderBy: ['lastActiveAt', 'desc'] });
    expect(store.queries[0]).toContainEqual({ limit: 100 });
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

  it('reads every assignment for one email, capped', async () => {
    store.queue = [[d('a1', { email: 'p@nonstopio.com', courseId: 'git', status: 'assigned' })]];
    expect((await data.assignmentsFor('p@nonstopio.com'))[0]).toMatchObject({
      id: 'a1',
      courseId: 'git',
      uid: null,
    });
    expect(store.queries[0]).toEqual([
      { collection: 'assignments' },
      { where: ['email', '==', 'p@nonstopio.com'] },
      { limit: 50 },
    ]);
  });

  it('reads one person’s newest attempts at a Pariksha: score, verdict and date only', async () => {
    store.queue = [
      [
        d('a2', {
          uid: 'u1',
          parikshaId: 'q1',
          score: 0.5,
          passed: true,
          createdAt: ts(9),
          answers: { k1: ['a'] },
        }),
        d('a1', { uid: 'u1', parikshaId: 'q1' }),
      ],
    ];
    expect(await data.attemptsFor('u1', 'git', 'q1')).toEqual([
      { id: 'a2', parikshaId: 'q1', score: 0.5, passed: true, at: new Date(9) },
      { id: 'a1', parikshaId: 'q1', score: 0, passed: false, at: null },
    ]);
    expect(store.queries[0]).toEqual([
      { collection: 'progress/u1_git/attempts' },
      { where: ['uid', '==', 'u1'] },
      { where: ['parikshaId', '==', 'q1'] },
      { orderBy: ['createdAt', 'desc'] },
      { limit: 10 },
    ]);
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

  it('reads a page of audit entries and resolves people to names once', async () => {
    store.docs.set('users/boss', { email: 'boss@nonstopio.com', displayName: 'Boss' });
    store.docs.set('users/dev', { email: 'dev@nonstopio.com', displayName: '' });
    store.queue = [
      [
        d('a1', {
          action: 'roles.set',
          by: 'boss',
          target: 'dev',
          detail: { acharya: true },
          at: ts(9),
        }),
        d('a2', { action: 'course.publish', by: 'boss', target: 'git' }),
        d('a3', { action: 'roles.set', by: 'gone', target: 'gone2', at: ts(1) }),
        d('a4', { action: 'assign', by: 'boss', at: ts(0) }),
      ],
    ];
    const page = await data.auditPage(null, 3);
    expect(store.queries[0]).toContainEqual({ orderBy: ['at', 'desc'] });
    expect(store.queries[0]).toContainEqual({ limit: 4 });
    expect(page.rows.map((r) => [r.by, r.target, r.detail, r.at?.getTime() ?? null])).toEqual([
      ['Boss', 'dev@nonstopio.com', { acharya: true }, 9],
      ['Boss', 'git', {}, null],
      ['gone', 'gone2', {}, 1],
    ]);
    expect(page.nextCursor).toEqual({ at: new Date(1), id: 'a3' });
  });

  it('continues after a cursor, and ends when the last page is short', async () => {
    store.docs.set('users/boss', { email: 'boss@nonstopio.com', displayName: 'Boss' });
    store.queue = [
      [d('a5', { action: 'assign', by: 'boss', at: ts(5) })],
      [d('a6', { action: 'assign', by: 'boss' })],
    ];
    const cursor = { at: new Date(7), id: 'a4' };
    const page = await data.auditPage(cursor, 3);
    expect(store.queries[0]).toContainEqual({ startAfter: [cursor.at, 'a4'] });
    expect(page.nextCursor).toBeNull();
    expect((await data.auditPage(null, 1)).nextCursor).toBeNull();
  });
});
