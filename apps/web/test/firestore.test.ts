import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  calls: [] as string[],
  updates: [] as unknown[],
  update: (() => Promise.resolve()) as () => Promise<void>,
  snapCb: undefined as undefined | ((s: unknown) => void),
}));
vi.mock('firebase/firestore', () => ({
  initializeFirestore: vi.fn((_app, settings) => ({ kind: 'db', settings })),
  persistentLocalCache: vi.fn((s) => ({ cache: 'persistent', ...s })),
  persistentMultipleTabManager: vi.fn(() => ({ tabs: 'multiple' })),
  connectFirestoreEmulator: vi.fn(() => state.calls.push('db-emulator')),
  doc: vi.fn((_d, c, id) => `${c}/${id}`),
  updateDoc: vi.fn((ref, patch) => {
    state.updates.push([ref, patch]);
    return state.update();
  }),
  onSnapshot: vi.fn((_r, cb) => {
    state.snapCb = cb;
    return () => {};
  }),
}));
vi.mock('../src/data/firebase', () => ({ firebaseLearnerData: vi.fn(() => 'learner') }));
vi.mock('../src/studio/firebase', () => ({ firebaseStudioData: vi.fn(() => 'studio') }));
vi.mock('../src/console/firebase', () => ({ firebaseConsoleData: vi.fn(() => 'console') }));
vi.mock('../src/log', () => ({ log: { warn: vi.fn() } }));

import { initializeFirestore } from 'firebase/firestore';
import { openFirestore } from '../src/firestore';
import { log } from '../src/log';

beforeEach(() => {
  state.calls.length = 0;
  state.updates.length = 0;
  state.update = () => Promise.resolve();
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
    state.snapCb?.({ exists: () => true, data: () => ({ roles: ['learner'] }) });
    expect(cb).toHaveBeenNthCalledWith(1, null);
    expect(cb).toHaveBeenNthCalledWith(2, { roles: ['learner'] });
  });

  it('fills in the lower-cased name a profile lacks, once per watch', () => {
    const cb = vi.fn();
    openFirestore({} as never, false).watchProfile('u', cb);
    const snap = (data: object) => ({ exists: () => true, ref: 'users/u', data: () => data });
    state.snapCb?.(snap({ displayName: 'Ananya Rao', roles: ['learner'] }));
    state.snapCb?.(snap({ displayName: 'Ananya Rao', roles: ['learner'] }));
    expect(state.updates).toEqual([['users/u', { nameLower: 'ananya rao' }]]);
    expect(cb).toHaveBeenCalledWith({ displayName: 'Ananya Rao', roles: ['learner'] });
  });

  it('leaves a profile whose lower-cased name is already in step', () => {
    openFirestore({} as never, false).watchProfile('u', vi.fn());
    state.snapCb?.({
      exists: () => true,
      ref: 'users/u',
      data: () => ({ displayName: 'Ravi', nameLower: 'ravi', roles: ['learner'] }),
    });
    expect(state.updates).toEqual([]);
  });

  it('logs, without failing the watch, when the name cannot be saved', async () => {
    state.update = () => Promise.reject(Object.assign(new Error('denied'), { code: 'denied' }));
    const cb = vi.fn();
    openFirestore({} as never, false).watchProfile('u', cb);
    state.snapCb?.({ exists: () => true, ref: 'users/u', data: () => ({ displayName: 'Ravi' }) });
    await vi.waitFor(() =>
      expect(log.warn).toHaveBeenCalledWith('Profile name key not saved', {
        uid: 'u',
        code: 'denied',
      }),
    );
    expect(cb).toHaveBeenCalledWith({ displayName: 'Ravi' });
  });
});
