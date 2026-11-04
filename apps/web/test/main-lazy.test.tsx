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
vi.mock('../src/auth/service', () => ({
  firebaseAuthService: vi.fn((_fb, watchProfile) => ({ watchProfile, signOut: authSignOut })),
}));
vi.mock('../src/firestore', () => ({ openFirestore: open }));
vi.mock('../src/performance', () => ({ startPerformance: perf }));

const perfOn = { VITE_PERFORMANCE_MONITORING: 'true' };

describe('main loads Firestore on demand', () => {
  it('opens it once, on first use, and routes each port to its store', async () => {
    const stop = vi.fn();
    const stores = {
      learner: { listCourses: vi.fn().mockResolvedValue(['c']) },
      studio: { listCourses: vi.fn().mockResolvedValue(['s']) },
      console: { overview: vi.fn().mockResolvedValue('o') },
      watchProfile: vi.fn(() => stop),
    };
    open.mockReturnValue(stores);
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
});
