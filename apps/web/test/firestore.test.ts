import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  calls: [] as string[],
  snapCb: undefined as undefined | ((s: unknown) => void),
}));
vi.mock('firebase/firestore', () => ({
  initializeFirestore: vi.fn((_app, settings) => ({ kind: 'db', settings })),
  persistentLocalCache: vi.fn((s) => ({ cache: 'persistent', ...s })),
  persistentMultipleTabManager: vi.fn(() => ({ tabs: 'multiple' })),
  connectFirestoreEmulator: vi.fn(() => state.calls.push('db-emulator')),
  doc: vi.fn((_d, c, id) => `${c}/${id}`),
  onSnapshot: vi.fn((_r, cb) => {
    state.snapCb = cb;
    return () => {};
  }),
}));
vi.mock('../src/data/firebase', () => ({ firebaseLearnerData: vi.fn(() => 'learner') }));
vi.mock('../src/studio/firebase', () => ({ firebaseStudioData: vi.fn(() => 'studio') }));
vi.mock('../src/console/firebase', () => ({ firebaseConsoleData: vi.fn(() => 'console') }));

import { initializeFirestore } from 'firebase/firestore';
import { openFirestore } from '../src/firestore';

beforeEach(() => {
  state.calls.length = 0;
});

describe('openFirestore', () => {
  it('keeps a persistent Firestore cache shared across tabs, so reading works offline', () => {
    openFirestore({} as never, false);
    expect(initializeFirestore).toHaveBeenCalledWith(
      {},
      { localCache: { cache: 'persistent', tabManager: { tabs: 'multiple' } } },
    );
    expect(state.calls).toEqual([]);
  });

  it('connects the emulator when asked', () => {
    openFirestore({} as never, true);
    expect(state.calls).toEqual(['db-emulator']);
  });

  it('builds the learner, studio and console data over one database', () => {
    const s = openFirestore({} as never, false);
    expect([s.learner, s.studio, s.console]).toEqual(['learner', 'studio', 'console']);
  });

  it('watches the profile, reporting a missing document as null', () => {
    const cb = vi.fn();
    openFirestore({} as never, false).watchProfile('u', cb);
    state.snapCb?.({ exists: () => false });
    state.snapCb?.({ exists: () => true, data: () => ({ roles: ['shishya'] }) });
    expect(cb).toHaveBeenNthCalledWith(1, null);
    expect(cb).toHaveBeenNthCalledWith(2, { roles: ['shishya'] });
  });
});
