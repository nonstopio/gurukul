import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';

interface Captured {
  data: { listCourses(): Promise<unknown> };
  studio: { data: { listCourses(): Promise<unknown> } };
  console: { data: { overview(): Promise<unknown> } };
  service: {
    watchProfile(uid: string, cb: () => void, onError: (e: unknown) => void): () => void;
  };
}
const props = vi.hoisted(() => ({ current: undefined as unknown }));
const open = vi.hoisted(() => vi.fn());
vi.mock('../src/App', () => ({
  App: (p: Record<string, unknown>) => {
    props.current = p;
    return null;
  },
}));
vi.mock('../src/console/service', () => ({ firebaseConsoleService: vi.fn(() => ({})) }));
vi.mock('../src/quiz/service', () => ({ firebaseQuizService: vi.fn(() => ({})) }));
vi.mock('../src/studio/service', () => ({ firebaseStudioService: vi.fn(() => ({})) }));
vi.mock('../src/firebase', () => ({ initFirebase: vi.fn(() => ({ app: 'app', auth: {} })) }));
vi.mock('../src/auth/service', () => ({
  firebaseAuthService: vi.fn((_fb, watchProfile) => ({ watchProfile })),
}));
vi.mock('../src/firestore', () => ({ openFirestore: open }));

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
    await act(async () => mount(document.getElementById('root'), { VITE_USE_EMULATORS: 'true' }));
    expect(open).not.toHaveBeenCalled();

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
});
