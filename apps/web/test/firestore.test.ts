import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  calls: [] as string[],
  updates: [] as unknown[],
  update: (() => Promise.resolve()) as () => Promise<void>,
  snapCb: undefined as undefined | ((s: unknown) => void),
  snapErr: undefined as unknown,
  user: null as null | { uid: string },
  pending: (() => Promise.resolve()) as () => Promise<void>,
  clear: (() => Promise.resolve()) as () => Promise<void>,
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
  waitForPendingWrites: vi.fn(() => {
    state.calls.push('wait');
    return state.pending();
  }),
  clearIndexedDbPersistence: vi.fn(() => {
    state.calls.push('clear');
    return state.clear();
  }),
  terminate: vi.fn((db) => {
    state.calls.push(`terminate:${(db as { kind: string }).kind}`);
    return Promise.resolve();
  }),
  onSnapshot: vi.fn((_r, cb, onError) => {
    state.snapCb = cb;
    state.snapErr = onError;
    return () => {};
  }),
}));
vi.mock('firebase/auth', () => ({ getAuth: vi.fn(() => ({ currentUser: state.user })) }));
vi.mock('../src/data/firebase', () => ({ firebaseLearnerData: vi.fn(() => 'learner') }));
vi.mock('../src/studio/firebase', () => ({ firebaseStudioData: vi.fn(() => 'studio') }));
vi.mock('../src/console/firebase', () => ({ firebaseConsoleData: vi.fn(() => 'console') }));
vi.mock('../src/log', () => ({ log: { warn: vi.fn() } }));

import { initializeFirestore } from 'firebase/firestore';
import { firebaseLearnerData } from '../src/data/firebase';
import { openFirestore, SIGN_OUT_SETTLE_MS } from '../src/firestore';
import { log } from '../src/log';

beforeEach(() => {
  state.calls.length = 0;
  state.updates.length = 0;
  state.update = () => Promise.resolve();
  state.pending = () => Promise.resolve();
  state.clear = () => Promise.resolve();
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

  it('stops by terminating its database', async () => {
    await openFirestore({} as never, false).stop();
    expect(state.calls).toEqual(['terminate:db']);
  });

  it('caches courses per signed-in person, and for nobody when signed out', () => {
    openFirestore({} as never, false);
    const who = vi.mocked(firebaseLearnerData).mock.calls.at(-1)?.[1] as () => string | undefined;
    state.user = null;
    expect(who()).toBeUndefined();
    state.user = { uid: 'ana' };
    expect(who()).toBe('ana');
  });

  it('watches the profile, reporting a missing document as null', () => {
    const cb = vi.fn();
    openFirestore({} as never, false).watchProfile('u', cb, vi.fn());
    state.snapCb?.({ exists: () => false });
    state.snapCb?.({ exists: () => true, data: () => ({ roles: ['learner'] }) });
    expect(cb).toHaveBeenNthCalledWith(1, null);
    expect(cb).toHaveBeenNthCalledWith(2, { roles: ['learner'] });
  });

  it('hands a failed watch to the caller', () => {
    const onError = vi.fn();
    openFirestore({} as never, false).watchProfile('u', vi.fn(), onError);
    expect(state.snapErr).toBe(onError);
  });

  it('fills in the lower-cased name a profile lacks, once per watch', () => {
    const cb = vi.fn();
    openFirestore({} as never, false).watchProfile('u', cb, vi.fn());
    const snap = (data: object) => ({ exists: () => true, ref: 'users/u', data: () => data });
    state.snapCb?.(snap({ displayName: 'Ananya Rao', roles: ['learner'] }));
    state.snapCb?.(snap({ displayName: 'Ananya Rao', roles: ['learner'] }));
    expect(state.updates).toEqual([['users/u', { nameLower: 'ananya rao' }]]);
    expect(cb).toHaveBeenCalledWith({ displayName: 'Ananya Rao', roles: ['learner'] });
  });

  it('leaves a profile whose lower-cased name is already in step', () => {
    openFirestore({} as never, false).watchProfile('u', vi.fn(), vi.fn());
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
    openFirestore({} as never, false).watchProfile('u', cb, vi.fn());
    state.snapCb?.({ exists: () => true, ref: 'users/u', data: () => ({ displayName: 'Ravi' }) });
    await vi.waitFor(() =>
      expect(log.warn).toHaveBeenCalledWith('Profile name key not saved', {
        uid: 'u',
        code: 'denied',
      }),
    );
    expect(cb).toHaveBeenCalledWith({ displayName: 'Ravi' });
  });

  describe('leave', () => {
    const signOut = () => {
      state.calls.push('signOut');
      return Promise.resolve();
    };

    it('waits for queued writes, signs out, then shuts down and deletes the local cache', async () => {
      await openFirestore({} as never, false).leave(signOut);
      expect(state.calls).toEqual(['wait', 'signOut', 'terminate:db', 'clear']);
    });

    it('leaves no timer behind once the queue drains quickly', async () => {
      vi.useFakeTimers();
      await openFirestore({} as never, false).leave(signOut);
      expect(vi.getTimerCount()).toBe(0);
      vi.useRealTimers();
    });

    it('still shuts down and clears the cache when signing out fails', async () => {
      const failing = () => {
        state.calls.push('signOut');
        return Promise.reject(new Error('network'));
      };
      await expect(openFirestore({} as never, false).leave(failing)).rejects.toThrow('network');
      expect(state.calls).toEqual(['wait', 'signOut', 'terminate:db', 'clear']);
    });

    it('gives up waiting on a queue that never drains, and still signs out', async () => {
      vi.useFakeTimers();
      state.pending = () => new Promise(() => {});
      const left = openFirestore({} as never, false).leave(signOut);
      await vi.advanceTimersByTimeAsync(SIGN_OUT_SETTLE_MS);
      await left;
      vi.useRealTimers();
      expect(state.calls).toEqual(['wait', 'signOut', 'terminate:db', 'clear']);
    });

    it('signs out even when waiting for the queue fails', async () => {
      state.pending = () => Promise.reject(new Error('user changed'));
      await openFirestore({} as never, false).leave(signOut);
      expect(state.calls).toContain('signOut');
    });

    it('logs, without failing sign-out, when another tab holds the cache open', async () => {
      state.clear = () =>
        Promise.reject(Object.assign(new Error('in use'), { code: 'failed-precondition' }));
      await openFirestore({} as never, false).leave(signOut);
      expect(log.warn).toHaveBeenCalledWith('Local cache not cleared', {
        code: 'failed-precondition',
      });
    });
  });
});
