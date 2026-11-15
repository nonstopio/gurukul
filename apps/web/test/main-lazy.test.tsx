import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';

interface Captured {
  data: { listCourses(): Promise<unknown> };
  studio: {
    data: { listCourses(): Promise<unknown> };
    storage: { upload(request: unknown): Promise<string> };
    checks: { bucket?: string; emulatorHost?: string };
  };
  console: { data: { overview(): Promise<unknown> } };
  service: {
    watchProfile(uid: string, cb: () => void, onError: (e: unknown) => void): () => void;
    onUser(cb: (user: unknown) => void): () => void;
    signOut(): Promise<void>;
  };
}
const props = vi.hoisted(() => ({ current: undefined as unknown }));
const open = vi.hoisted(() => vi.fn());
const perf = vi.hoisted(() => vi.fn());
vi.mock('../src/App', () => ({
  App: (p: Record<string, unknown>) => {
    props.current = p;
    return null;
  },
}));
vi.mock('../src/console/service', () => ({ firebaseConsoleService: vi.fn(() => ({})) }));
vi.mock('../src/quiz/service', () => ({ firebaseQuizService: vi.fn(() => ({})) }));
vi.mock('../src/studio/service', () => ({ firebaseStudioService: vi.fn(() => ({})) }));
vi.mock('../src/firebase', () => ({
  initFirebase: vi.fn(() => ({ app: 'app', auth: {}, storageBucket: 'b.firebasestorage.app' })),
}));
const mediaStorage = vi.hoisted(() => vi.fn());
vi.mock('../src/studio/storage', () => ({ firebaseMediaStorage: mediaStorage }));
const authSignOut = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const authOnUser = vi.hoisted(() => vi.fn(() => () => {}));
vi.mock('../src/auth/service', () => ({
  firebaseAuthService: vi.fn((_fb, watchProfile) => ({
    watchProfile,
    signOut: authSignOut,
    onUser: authOnUser,
  })),
}));
vi.mock('../src/firestore', () => ({ openFirestore: open }));
const studioData = vi.hoisted(() => vi.fn());
const consoleData = vi.hoisted(() => vi.fn());
vi.mock('../src/studio/firebase', () => ({ firebaseStudioData: studioData }));
vi.mock('../src/console/firebase', () => ({ firebaseConsoleData: consoleData }));
vi.mock('../src/performance', () => ({ startPerformance: perf }));
const checkForNewBuild = vi.hoisted(() => vi.fn());
vi.mock('../src/boot', () => ({ checkForNewBuild, reloadOnStaleBuild: vi.fn() }));
const stopApi = vi.hoisted(() => vi.fn());
vi.mock('../src/api', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  stopApi,
}));
const setUpdate = vi.hoisted(() => vi.fn());
vi.mock('../src/update', () => ({ setUpdate }));
type OnUpdate = (u: { kind: 'soft' | 'hard'; id: string }) => void;
const onUpdate = () => checkForNewBuild.mock.calls.at(-1)?.[2] as OnUpdate;

const perfOn = { VITE_PERFORMANCE_MONITORING: 'true' };

describe('main loads Firestore on demand', () => {
  it('opens it once, on first use, and routes each port to its store', async () => {
    const stop = vi.fn();
    const stores = {
      learner: { listCourses: vi.fn().mockResolvedValue(['c']) },
      db: 'db',
      watchProfile: vi.fn(() => stop),
    };
    open.mockReturnValue(stores);
    studioData.mockReset().mockReturnValue({ listCourses: vi.fn().mockResolvedValue(['s']) });
    consoleData.mockReset().mockReturnValue({ overview: vi.fn().mockResolvedValue('o') });
    document.body.innerHTML = '<div id="root"></div>';
    const { mount } = await import('../src/main');
    await new Promise((r) => setTimeout(r, 0));
    perf.mockClear(); // importing main mounts once with the real environment
    await act(async () => mount(document.getElementById('root'), { VITE_USE_EMULATORS: 'true' }));
    expect(open).not.toHaveBeenCalled();
    // Off unless the production build asks for it.
    await new Promise((r) => setTimeout(r, 0));
    expect(perf).not.toHaveBeenCalled();

    const p = props.current as Captured;
    expect(await p.data.listCourses()).toEqual(['c']);
    expect(await p.studio.data.listCourses()).toEqual(['s']);
    expect(await p.console.data.overview()).toBe('o');
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('app', true);
    // Each data module is built once, over the one database, however often it is used.
    await p.studio.data.listCourses();
    await p.console.data.overview();
    expect(studioData).toHaveBeenCalledOnce();
    expect(studioData).toHaveBeenCalledWith('db');
    expect(consoleData).toHaveBeenCalledOnce();
    expect(consoleData).toHaveBeenCalledWith('db');

    const onError = vi.fn();
    const off = p.service.watchProfile('u', vi.fn(), onError);
    await new Promise((r) => setTimeout(r, 0));
    expect(stores.watchProfile).toHaveBeenCalledWith('u', expect.any(Function), onError);
    off();
    expect(stop).toHaveBeenCalledTimes(1);

    // Left before the stores arrived: the watch is never started.
    stores.watchProfile.mockClear();
    p.service.watchProfile('u', vi.fn(), onError)();
    await new Promise((r) => setTimeout(r, 0));
    expect(stores.watchProfile).not.toHaveBeenCalled();
  });

  it('a required update stops the API and Firestore, then shows; nothing opens Firestore again', async () => {
    vi.resetModules();
    let stopped: () => void = () => {};
    const stop = vi.fn(() => new Promise<void>((r) => (stopped = r)));
    open.mockReset().mockReturnValue({
      learner: { listCourses: vi.fn().mockResolvedValue(['c']) },
      watchProfile: vi.fn(),
      stop,
    });
    document.body.innerHTML = '<div id="root"></div>';
    const { mount } = await import('../src/main');
    await act(async () => mount(document.getElementById('root'), { VITE_BUILD_ID: 'a' }));
    expect(checkForNewBuild).toHaveBeenLastCalledWith('a', 0, expect.any(Function));
    const p = props.current as Captured;
    expect(await p.data.listCourses()).toEqual(['c']);

    // A soft update is shown at once and stops nothing.
    onUpdate()({ kind: 'soft', id: 'b' });
    expect(setUpdate).toHaveBeenLastCalledWith({ kind: 'soft', id: 'b' });
    await new Promise((r) => setTimeout(r, 0));
    expect(stop).not.toHaveBeenCalled();
    expect(stopApi).not.toHaveBeenCalled();

    // A hard one stops the API at once, and shows only once Firestore has stopped: the shutdown
    // is the last thing the tab sends.
    setUpdate.mockClear();
    onUpdate()({ kind: 'hard', id: 'c' });
    expect(stopApi).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce());
    expect(setUpdate).not.toHaveBeenCalled();
    stopped();
    await vi.waitFor(() => expect(setUpdate).toHaveBeenCalledWith({ kind: 'hard', id: 'c' }));
    await expect(p.data.listCourses()).rejects.toThrow('stopped for a required update');
    const onError = vi.fn();
    p.service.watchProfile('u', vi.fn(), onError);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(open).toHaveBeenCalledOnce();
    stopApi.mockClear();
  });

  it('a required update shows even when Firestore never opened, or failed to download', async () => {
    vi.resetModules();
    open.mockReset();
    setUpdate.mockClear();
    document.body.innerHTML = '<div id="root"></div>';
    const { mount } = await import('../src/main');
    await act(async () => mount(document.getElementById('root'), { VITE_BUILD_ID: 'a' }));
    onUpdate()({ kind: 'hard', id: 'c' });
    expect(stopApi).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(setUpdate).toHaveBeenCalledWith({ kind: 'hard', id: 'c' }));
    expect(open).not.toHaveBeenCalled();

    vi.resetModules();
    setUpdate.mockClear();
    vi.doMock('../src/firestore', () => {
      throw new Error('Failed to fetch dynamically imported module');
    });
    const again = await import('../src/main');
    await act(async () => again.mount(document.getElementById('root'), { VITE_BUILD_ID: 'a' }));
    const p = props.current as Captured;
    const loading = p.data.listCourses();
    onUpdate()({ kind: 'hard', id: 'c' });
    await expect(loading).rejects.toThrow();
    await vi.waitFor(() => expect(setUpdate).toHaveBeenCalledWith({ kind: 'hard', id: 'c' }));
    vi.doMock('../src/firestore', () => ({ openFirestore: open }));
    stopApi.mockClear();
  });

  it('reports a Firestore chunk that failed to download, and fetches it again next time', async () => {
    vi.resetModules();
    open.mockReset();
    vi.doMock('../src/firestore', () => {
      throw new Error('Failed to fetch dynamically imported module');
    });
    document.body.innerHTML = '<div id="root"></div>';
    const { mount } = await import('../src/main');
    await act(async () => mount(document.getElementById('root'), {}));
    const p = props.current as Captured;
    const onError = vi.fn();
    // Someone who left before the download failed hears nothing.
    p.service.watchProfile('u', vi.fn(), onError)();
    p.service.watchProfile('u', vi.fn(), onError);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));

    const watch = vi.fn(() => () => {});
    vi.doMock('../src/firestore', () => ({ openFirestore: () => ({ watchProfile: watch }) }));
    p.service.watchProfile('u', vi.fn(), onError);
    await vi.waitFor(() => expect(watch).toHaveBeenCalled());
  });

  it('loads Cloud Storage on the first upload, once, and says where uploads live', async () => {
    vi.resetModules();
    const impl = { upload: vi.fn().mockResolvedValue('https://example.com/f') };
    mediaStorage.mockReset().mockReturnValue(impl);
    document.body.innerHTML = '<div id="root"></div>';
    const { mount } = await import('../src/main');
    await act(async () => mount(document.getElementById('root'), { VITE_USE_EMULATORS: 'true' }));
    const p = props.current as Captured;
    expect(p.studio.checks).toEqual({
      bucket: 'b.firebasestorage.app',
      emulatorHost: '127.0.0.1:9199',
    });
    expect(mediaStorage).not.toHaveBeenCalled();
    expect(await p.studio.storage.upload({ path: 'a' })).toBe('https://example.com/f');
    await p.studio.storage.upload({ path: 'b' });
    expect(mediaStorage).toHaveBeenCalledTimes(1);
    expect(mediaStorage).toHaveBeenCalledWith('app', true);
    expect(impl.upload).toHaveBeenCalledTimes(2);

    await act(async () => mount(document.getElementById('root'), {}));
    expect((props.current as Captured).studio.checks.emulatorHost).toBeUndefined();
  });

  it('fetches the Storage chunk again after a failed download', async () => {
    vi.resetModules();
    vi.doMock('../src/studio/storage', () => {
      throw new Error('Failed to fetch dynamically imported module');
    });
    document.body.innerHTML = '<div id="root"></div>';
    const { mount } = await import('../src/main');
    await act(async () => mount(document.getElementById('root'), {}));
    const p = props.current as Captured;
    await expect(p.studio.storage.upload({})).rejects.toThrow();
    vi.doMock('../src/studio/storage', () => ({
      firebaseMediaStorage: () => ({ upload: async () => 'ok' }),
    }));
    expect(await p.studio.storage.upload({})).toBe('ok');
  });

  it('starts Performance Monitoring against production, and survives it failing to load', async () => {
    vi.resetModules();
    document.body.innerHTML = '<div id="root"></div>';
    const { mount } = await import('../src/main');
    await act(async () => mount(document.getElementById('root'), perfOn));
    await vi.waitFor(() => expect(perf).toHaveBeenCalledWith('app'));

    perf.mockImplementationOnce(() => {
      throw new Error('blocked');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await act(async () => mount(document.getElementById('root'), perfOn));
    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith('Performance monitoring did not start', expect.anything()),
    );
    warn.mockRestore();
  });

  it('signs out without touching Firestore when it was never opened', async () => {
    vi.resetModules();
    open.mockReset();
    authSignOut.mockClear();
    vi.doMock('../src/firestore', () => ({ openFirestore: open }));
    document.body.innerHTML = '<div id="root"></div>';
    const { mount } = await import('../src/main');
    await act(async () => mount(document.getElementById('root'), {}));
    await (props.current as Captured).service.signOut();
    expect(authSignOut).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
  });

  it('signs out through Firestore, deleting its cache, and opens a fresh one next time', async () => {
    vi.resetModules();
    authSignOut.mockClear();
    const leave = vi.fn((signOut: () => Promise<void>) => signOut());
    open.mockReset().mockImplementation(() => ({
      learner: { listCourses: vi.fn().mockResolvedValue([]) },
      leave,
    }));
    vi.doMock('../src/firestore', () => ({ openFirestore: open }));
    document.body.innerHTML = '<div id="root"></div>';
    const { mount } = await import('../src/main');
    await act(async () => mount(document.getElementById('root'), {}));
    const p = props.current as Captured;
    await p.data.listCourses();
    await p.service.signOut();
    expect(leave).toHaveBeenCalledWith(authSignOut);
    expect(authSignOut).toHaveBeenCalledTimes(1);
    await p.data.listCourses();
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('opens a fresh Firestore after a sign-out that failed, never the shut-down one', async () => {
    vi.resetModules();
    authSignOut.mockClear();
    const leave = vi.fn(() => Promise.reject(new Error('network')));
    open.mockReset().mockImplementation(() => ({
      learner: { listCourses: vi.fn().mockResolvedValue([]) },
      leave,
    }));
    vi.doMock('../src/firestore', () => ({ openFirestore: open }));
    document.body.innerHTML = '<div id="root"></div>';
    const { mount } = await import('../src/main');
    await act(async () => mount(document.getElementById('root'), {}));
    const p = props.current as Captured;
    await p.data.listCourses();
    await expect(p.service.signOut()).rejects.toThrow('network');
    await p.data.listCourses();
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('signs out plainly when the Firestore chunk fails to download', async () => {
    vi.resetModules();
    authSignOut.mockClear();
    vi.doMock('../src/firestore', () => {
      throw new Error('Failed to fetch dynamically imported module');
    });
    document.body.innerHTML = '<div id="root"></div>';
    const { mount } = await import('../src/main');
    await act(async () => mount(document.getElementById('root'), {}));
    const p = props.current as Captured;
    // Signing out while the download is still failing waits for it, then signs out plainly.
    const read = p.data.listCourses();
    await p.service.signOut();
    await expect(read).rejects.toThrow();
    expect(authSignOut).toHaveBeenCalledTimes(1);
    vi.doUnmock('../src/firestore');
  });

  it('builds Studio and console data afresh for a new Firestore, and retries a failed download', async () => {
    vi.resetModules();
    open.mockReset().mockImplementation(() => ({
      db: {},
      learner: {},
      leave: (signOut: () => Promise<void>) => signOut(),
    }));
    vi.doMock('../src/firestore', () => ({ openFirestore: open }));
    studioData.mockReset().mockImplementation(() => ({ listCourses: async () => 's' }));
    document.body.innerHTML = '<div id="root"></div>';
    const { mount } = await import('../src/main');
    await act(async () => mount(document.getElementById('root'), {}));
    const p = props.current as Captured;
    await p.studio.data.listCourses();
    await p.service.signOut();
    await p.studio.data.listCourses();
    expect(studioData).toHaveBeenCalledTimes(2);
    expect(studioData.mock.calls[0]?.[0]).not.toBe(studioData.mock.calls[1]?.[0]);

    // A chunk that fails to download is forgotten: the next call fetches it again.
    studioData.mockReset().mockImplementation(() => ({ listCourses: async () => 's' }));
    vi.doMock('../src/studio/firebase', () => {
      throw new Error('Failed to fetch dynamically imported module');
    });
    vi.doMock('../src/console/firebase', () => ({ firebaseConsoleData: consoleData }));
    vi.resetModules();
    const again = await import('../src/main');
    await act(async () => again.mount(document.getElementById('root'), {}));
    const q = props.current as Captured;
    await expect(q.studio.data.listCourses()).rejects.toThrow();
    vi.doMock('../src/studio/firebase', () => ({ firebaseStudioData: studioData }));
    expect(await q.studio.data.listCourses()).toBe('s');
  });

  it('starts Firestore at once for a returning person, and keeps the flag in step with sign-in', async () => {
    vi.resetModules();
    localStorage.clear();
    open.mockReset().mockReturnValue({ db: {}, learner: {}, watchProfile: vi.fn(() => () => {}) });
    document.body.innerHTML = '<div id="root"></div>';
    const { mount } = await import('../src/main');
    // A first-time visitor downloads nothing.
    await act(async () => mount(document.getElementById('root'), {}));
    await new Promise((r) => setTimeout(r, 0));
    expect(open).not.toHaveBeenCalled();

    // The profile watch of a signed-in person sets the flag.
    const p = props.current as Captured;
    p.service.watchProfile('u', vi.fn(), vi.fn());
    expect(localStorage.getItem('gurukul.signedIn')).toBe('1');
    await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());

    // The next visit opens Firestore without waiting for auth.
    open.mockClear();
    await act(async () => mount(document.getElementById('root'), {}));
    await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());

    // Auth reporting no one (expired session, sign-out) clears it; a user does not.
    const cb = vi.fn();
    (props.current as Captured).service.onUser(cb);
    const report = (authOnUser.mock.calls.at(-1) as unknown as [(u: unknown) => void])[0];
    report({ uid: 'u' });
    expect(localStorage.getItem('gurukul.signedIn')).toBe('1');
    report(null);
    expect(localStorage.getItem('gurukul.signedIn')).toBeNull();
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('works with storage blocked, and forgets a failed early start', async () => {
    vi.resetModules();
    const blocked = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    open.mockReset().mockReturnValue({ db: {}, learner: {}, watchProfile: vi.fn(() => () => {}) });
    document.body.innerHTML = '<div id="root"></div>';
    const { mount } = await import('../src/main');
    await act(async () => mount(document.getElementById('root'), {}));
    (props.current as Captured).service.watchProfile('u', vi.fn(), vi.fn());
    await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());
    blocked.mockRestore();
    vi.restoreAllMocks();

    // The early start fails to download: swallowed, and the profile watch fetches again.
    vi.resetModules();
    localStorage.setItem('gurukul.signedIn', '1');
    vi.doMock('../src/firestore', () => {
      throw new Error('Failed to fetch dynamically imported module');
    });
    const failing = await import('../src/main');
    await act(async () => failing.mount(document.getElementById('root'), {}));
    await new Promise((r) => setTimeout(r, 0));
    const watch = vi.fn(() => () => {});
    vi.doMock('../src/firestore', () => ({ openFirestore: () => ({ watchProfile: watch }) }));
    (props.current as Captured).service.watchProfile('u', vi.fn(), vi.fn());
    await vi.waitFor(() => expect(watch).toHaveBeenCalled());
    localStorage.clear();
    vi.doUnmock('../src/firestore');
  });
});
