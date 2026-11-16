import { describe, expect, it, vi } from 'vitest';
import { handleCourseWrite, reconcileSummaries } from '../src/summaries.js';
import type { SummaryStore, SyncOutcome } from '../src/summaries.js';
import { firestoreSummaryStore } from '../src/stores.js';
import { course, ts } from './fixtures.js';

vi.mock('firebase-admin/firestore', () => ({ FieldValue: {} }));

const storeWith = (stale: string[] = [], outcome: (id: string) => SyncOutcome = () => 'written') =>
  ({
    sync: vi.fn(async (id: string) => outcome(id)),
    stale: vi.fn(async () => stale),
  }) satisfies SummaryStore;

const live = (over: object = {}) => ({ ...course({}, over), publishedAt: ts(1) });

describe('handleCourseWrite', () => {
  it('syncs a new course, a change the summary shows, and a deleted course', async () => {
    const store = storeWith();
    expect(await handleCourseWrite(store, 'git-basics', undefined, live())).toBe('written');
    await handleCourseWrite(store, 'git-basics', live(), live({ title: 'Git, renamed' }));
    await handleCourseWrite(store, 'git-basics', live(), {
      ...live(),
      visibility: 'staff',
      visibleTeamIds: [],
    });
    await handleCourseWrite(store, 'git-basics', live(), { ...live(), publishedAt: ts(2) });
    await handleCourseWrite(store, 'git-basics', live(), undefined);
    expect(store.sync).toHaveBeenCalledTimes(5);
    expect(store.sync).toHaveBeenCalledWith('git-basics');
  });

  it('returns before touching the store when nothing the summary holds changed', async () => {
    const store = storeWith();
    const renamed = live({ educatorNames: { u1: 'Asha Rao' }, description: 'Longer.' });
    expect(await handleCourseWrite(store, 'git-basics', live(), renamed)).toBe('skipped');
    expect(await handleCourseWrite(store, 'x', { broken: 1 }, { broken: 2 })).toBe('skipped');
    const shell = live({ status: 'draft', version: 0 });
    expect(
      await handleCourseWrite(
        store,
        'x',
        { ...shell, publishedAt: null },
        { ...shell, publishedAt: null },
      ),
    ).toBe('skipped');
    expect(store.sync).not.toHaveBeenCalled();
  });
});

describe('reconcileSummaries', () => {
  it('syncs every stale id, in rounds, and counts the ones it changed', async () => {
    const ids = Array.from({ length: 45 }, (_, i) => `c${i}`);
    const store = storeWith(ids, (id) => (id === 'c3' ? 'unchanged' : 'written'));
    expect(await reconcileSummaries(store)).toEqual({ count: 45, changed: 44 });
    expect(store.sync).toHaveBeenCalledTimes(45);
  });

  it('does nothing when every summary is current', async () => {
    const store = storeWith();
    expect(await reconcileSummaries(store)).toEqual({ count: 0, changed: 0 });
    expect(store.sync).not.toHaveBeenCalled();
  });
});

/** A snapshot: `data` undefined means the document does not exist. */
const snap = (id: string, data: Record<string, unknown> | undefined, updated?: number) => ({
  id,
  exists: data !== undefined,
  data: () => data,
  get: (field: string) => data?.[field],
  updateTime: updated === undefined ? undefined : time(updated),
});
const time = (ms: number) => ({ ms, isEqual: (o: { ms: number }) => o.ms === ms });

function dbWith(
  courses: Record<string, ReturnType<typeof snap>>,
  summaries: Record<string, ReturnType<typeof snap>>,
) {
  const tx = {
    get: vi.fn(async (ref: string) => {
      const [collection, id] = ref.split('/') as [string, string];
      const found = (collection === 'courses' ? courses : summaries)[id];
      return found ?? snap(id, undefined);
    }),
    set: vi.fn(),
    delete: vi.fn(),
  };
  const db = {
    doc: (path: string) => path,
    runTransaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    collection: (name: string) => ({
      select: () => ({
        get: async () => ({ docs: Object.values(name === 'courses' ? courses : summaries) }),
      }),
    }),
  } as never;
  return { db, tx };
}

describe('firestoreSummaryStore', () => {
  it('writes the summary of the course as it is now, stamped with the course’s update time', async () => {
    const { db, tx } = dbWith({ 'git-basics': snap('git-basics', live(), 7) }, {});
    expect(await firestoreSummaryStore(db).sync('git-basics')).toBe('written');
    expect(tx.set).toHaveBeenCalledWith(
      'courseSummaries/git-basics',
      expect.objectContaining({
        id: 'git-basics',
        title: 'Git basics',
        visibility: 'public',
        summaryVersion: 1,
        courseUpdatedAt: expect.objectContaining({ ms: 7 }),
      }),
    );
    expect(JSON.stringify(tx.set.mock.calls[0]?.[1])).not.toContain('questions');
  });

  it('leaves a summary already derived from this state of the course alone', async () => {
    const current = snap('git-basics', { summaryVersion: 1, courseUpdatedAt: time(7) });
    const { db, tx } = dbWith(
      { 'git-basics': snap('git-basics', live(), 7) },
      { 'git-basics': current },
    );
    expect(await firestoreSummaryStore(db).sync('git-basics')).toBe('unchanged');
    expect(tx.set).not.toHaveBeenCalled();
  });

  it('deletes the summary of a course that is gone or unreadable, once', async () => {
    const stored = snap('gone', { summaryVersion: 1 });
    const { db, tx } = dbWith({ broken: snap('broken', { title: 'x' }, 1) }, { gone: stored });
    expect(await firestoreSummaryStore(db).sync('gone')).toBe('deleted');
    expect(tx.delete).toHaveBeenCalledWith('courseSummaries/gone');
    expect(await firestoreSummaryStore(db).sync('broken')).toBe('unchanged');
    expect(tx.delete).toHaveBeenCalledOnce();
  });

  it('names what is stale: missing, older than its course, another version, or orphaned', async () => {
    const { db } = dbWith(
      {
        fresh: snap('fresh', {}, 5),
        missing: snap('missing', {}, 5),
        older: snap('older', {}, 5),
        versioned: snap('versioned', {}, 5),
        unstamped: snap('unstamped', {}, 5),
        timeless: snap('timeless', {}),
      },
      {
        fresh: snap('fresh', { summaryVersion: 1, courseUpdatedAt: time(5) }),
        older: snap('older', { summaryVersion: 1, courseUpdatedAt: time(4) }),
        versioned: snap('versioned', { summaryVersion: 0, courseUpdatedAt: time(5) }),
        unstamped: snap('unstamped', { summaryVersion: 1 }),
        timeless: snap('timeless', { summaryVersion: 1, courseUpdatedAt: time(5) }),
        orphan: snap('orphan', { summaryVersion: 1, courseUpdatedAt: time(5) }),
      },
    );
    expect(await firestoreSummaryStore(db).stale()).toEqual([
      'missing',
      'older',
      'versioned',
      'unstamped',
      'timeless',
      'orphan',
    ]);
  });
});
