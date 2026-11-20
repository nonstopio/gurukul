import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthoringSession } from '@gurukul/schema';
import { makeCourse } from './fake-data';
import { fakeAgent, fakeDesktop } from './fake-desktop';
import { draftDoc } from './fake-studio';

/*
 * Save to draft through the real `firebaseStudioData.saveDraft`, over the same emulator-free
 * Firestore fake Studio's own tests use (`studio-firebase.test.ts`): one transaction, its `rev`
 * check, the `answersChanged` mark, and a conflict read back as the draft that moved.
 */

const store = vi.hoisted(() => ({
  docs: new Map<string, unknown>(),
  writes: [] as unknown[][],
  transactions: 0,
}));

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: (_db: unknown, ...path: string[]) => ({ collection: path.join('/') }),
  deleteDoc: vi.fn(),
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  getCountFromServer: vi.fn(),
  getDoc: async (ref: { path: string }) => ({
    exists: () => store.docs.has(ref.path),
    data: () => store.docs.get(ref.path),
  }),
  getDocs: vi.fn(),
  updateDoc: vi.fn(),
  limit: (n: number) => ({ limit: n }),
  orderBy: (f: string, d?: string) => ({ orderBy: [f, d] }),
  query: (...parts: unknown[]) => ({ parts }),
  runTransaction: async (_db: unknown, fn: (tx: unknown) => unknown) => {
    store.transactions += 1;
    return fn({
      get: async (ref: { path: string }) => ({
        exists: () => store.docs.has(ref.path),
        data: () => store.docs.get(ref.path),
      }),
      update: (ref: { path: string }, data: unknown) =>
        store.writes.push(['update', ref.path, data]),
    });
  },
  serverTimestamp: () => 'NOW',
  where: (f: string, op: string, v: unknown) => ({ where: [f, op, v] }),
}));

vi.mock('../src/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const { firebaseStudioData } = await import('../src/studio/firebase');
const { createAgentSession } = await import('../src/studio/session/agent');
const { saveSession } = await import('../src/studio/session/save');
const { createSessionStore } = await import('../src/studio/session/store');

const DRAFT = 'courses/git/drafts/current';
const stored = (rev: number, over: object = {}) => ({
  rev,
  updatedAt: { toDate: () => new Date('2026-11-19T09:00:00Z') },
  updatedBy: 'u2',
  course: makeCourse(),
  answers: { q1: { k1: ['a'] } },
  ...over,
});

/** An edit session that started from Draft v3, whose one turn changed the Quiz's correct answer. */
async function session() {
  const fake = fakeDesktop();
  fakeAgent(fake.desktop);
  const files = createSessionStore({ desktop: fake.desktop, uid: 'u1', newId: () => 's1' });
  await files.start({ kind: 'edit', courseId: 'git', goal: 'Fix the Quiz.' }, async () =>
    draftDoc(makeCourse(), { rev: 3, answers: { q1: { k1: ['a'] } } }),
  );
  const runtime = createAgentSession({ desktop: fake.desktop, uid: 'u1', sessionId: 's1' });
  await runtime.open();
  const work = runtime.getState().work as NonNullable<ReturnType<typeof runtime.getState>['work']>;
  expect(
    await runtime.educatorTurn({ ...work, answers: { q1: { k1: ['b'] } } }, 'Correct answer B'),
  ).toBe(true);
  const disk = () => JSON.parse(fake.files.get('u1/s1/session.json') as string) as AuthoringSession;
  return { runtime, disk };
}

const ids = { uid: 'u1', sessionId: 's1', courseId: 'git' };

afterEach(() => {
  store.docs.clear();
  store.writes.length = 0;
  store.transactions = 0;
});

describe('Save to draft through Studio’s transaction', () => {
  it('writes the draft once, against the base rev, marking the changed answer key', async () => {
    store.docs.set(DRAFT, stored(3));
    const s = await session();
    const outcome = await saveSession(s.runtime, firebaseStudioData({} as never), ids);
    expect(outcome).toEqual({ status: 'saved', rev: 4, kept: true });
    expect(store.transactions).toBe(1);
    expect(store.writes).toHaveLength(1);
    expect(store.writes[0]).toEqual([
      'update',
      DRAFT,
      expect.objectContaining({
        rev: 4,
        updatedAt: 'NOW',
        updatedBy: 'u1',
        answers: { q1: { k1: ['b'] } },
        answersChanged: true,
      }),
    ]);
    expect(s.disk().status).toBe('saved');
  });

  it('writes nothing when the stored rev moved, and reads the draft that moved', async () => {
    store.docs.set(DRAFT, stored(5));
    const s = await session();
    const outcome = await saveSession(s.runtime, firebaseStudioData({} as never), ids);
    expect(outcome).toMatchObject({ status: 'moved', stored: { rev: 5, updatedBy: 'u2' } });
    expect(store.writes).toEqual([]);
    expect(s.disk().status).toBe('open');
    expect(s.runtime.getState().canSave).toBe(true);
  });
});
