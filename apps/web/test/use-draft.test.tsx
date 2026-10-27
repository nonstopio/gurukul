import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { DraftConflictError } from '../src/studio/errors';
import type { DraftDoc, Working } from '../src/studio/types';
import { StudioProvider, useStudio } from '../src/studio/StudioProvider';
import { AUTOSAVE_MS, SAVE_WAIT_MS, useDraft } from '../src/studio/useDraft';
import { makeCourse } from './fake-data';
import { draftDoc, fakeStudio } from './fake-studio';

vi.mock('../src/auth/AuthProvider', () => ({ useUser: () => ({ uid: 'u1' }) }));
vi.mock('../src/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const setup = (studio = fakeStudio({ draft: draftDoc(makeCourse(), { rev: 4 }) })) => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StudioProvider data={studio.data} service={studio.service}>
      {children}
    </StudioProvider>
  );
  return { studio, ...renderHook(() => useDraft('git'), { wrapper }) };
};
const rename =
  (title: string) =>
  (w: Working): Working => ({
    ...w,
    course: { ...w.course, title },
  });

describe('useDraft', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('loads the draft and its rev', async () => {
    const { result } = setup();
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toMatchObject({ rev: 4, save: 'saved' });
    expect(result.current.work?.course.title).toBe('Git, the NonStop Way');
  });

  it('reports a missing draft and a load failure', async () => {
    const missing = setup(fakeStudio({ draft: null }));
    await waitFor(() => expect(missing.result.current.status).toBe('missing'));
    const broken = fakeStudio();
    broken.data.getDraft = vi.fn().mockRejectedValue(new Error('offline'));
    const failed = setup(broken);
    await waitFor(() => expect(failed.result.current.status).toBe('error'));
  });

  it('ignores a load that finishes after the page was left', async () => {
    const studio = fakeStudio();
    let release: (v: null) => void = () => {};
    studio.data.getDraft = vi.fn(() => new Promise<DraftDoc | null>((r) => (release = r)));
    const { result, unmount } = setup(studio);
    unmount();
    release(null);
    await Promise.resolve();
    expect(result.current.status).toBe('loading');
  });

  it('ignores a load failure that arrives after the page was left', async () => {
    const studio = fakeStudio();
    let fail: (e: Error) => void = () => {};
    studio.data.getDraft = vi.fn(
      () => new Promise<DraftDoc | null>((_r, reject) => (fail = reject)),
    );
    const { unmount } = setup(studio);
    unmount();
    fail(new Error('offline'));
    await Promise.resolve();
  });

  it('ignores an edit before the draft has loaded', async () => {
    const { result } = setup();
    act(() => result.current.update(rename('Early')));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.work?.course.title).toBe('Git, the NonStop Way');
  });

  it('has nothing to save before the draft has loaded', async () => {
    const { result, studio } = setup();
    expect(await result.current.saveNow()).toBe(true);
    expect(studio.data.saveDraft).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('autosaves a second after the last edit, with the rev it loaded', async () => {
    const { result, studio } = setup();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.update(rename('A')));
    act(() => result.current.update(rename('B')));
    expect(result.current.save).toBe('dirty');
    expect(studio.data.saveDraft).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(AUTOSAVE_MS);
    });
    await waitFor(() => expect(result.current.save).toBe('saved'));
    expect(studio.data.saveDraft).toHaveBeenCalledTimes(1);
    expect(studio.data.saveDraft).toHaveBeenCalledWith(
      'git',
      expect.objectContaining({ course: expect.objectContaining({ title: 'B' }) }),
      4,
      'u1',
    );
    expect(result.current.rev).toBe(5);
  });

  it('saves on demand, and does nothing when there is nothing to save', async () => {
    const { result, studio } = setup();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(await result.current.saveNow()).toBe(true);
    expect(studio.data.saveDraft).not.toHaveBeenCalled();
    act(() => result.current.update(rename('C')));
    let ok = false;
    await act(async () => {
      ok = await result.current.saveNow();
    });
    expect(ok).toBe(true);
    expect(studio.data.saveDraft).toHaveBeenCalledTimes(1);
  });

  it('stays dirty when edits arrive while a save is in flight', async () => {
    const studio = fakeStudio({ draft: draftDoc(makeCourse(), { rev: 1 }) });
    let finish: (rev: number) => void = () => {};
    // Later saves (the flush when the test unmounts) settle, as real ones do.
    studio.data.saveDraft = vi
      .fn()
      .mockImplementationOnce(() => new Promise<number>((r) => (finish = r)))
      .mockResolvedValue(3);
    const { result } = setup(studio);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.update(rename('D')));
    let first: Promise<boolean> = Promise.resolve(false);
    act(() => {
      first = result.current.saveNow();
    });
    expect(result.current.save).toBe('saving');
    expect(await result.current.saveNow()).toBe(false);
    act(() => result.current.update(rename('E')));
    await act(async () => {
      finish(2);
      expect(await first).toBe(false);
    });
    expect(result.current.save).toBe('dirty');
    expect(result.current.rev).toBe(2);
  });

  it('marks a conflict, keeps it through later edits, and reloads on request', async () => {
    const studio = fakeStudio({ draft: draftDoc(makeCourse(), { rev: 1 }) });
    studio.data.saveDraft = vi.fn().mockRejectedValue(new DraftConflictError());
    const { result } = setup(studio);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.update(rename('F')));
    await act(async () => {
      expect(await result.current.saveNow()).toBe(false);
    });
    expect(result.current.save).toBe('conflict');
    act(() => result.current.update(rename('G')));
    expect(result.current.save).toBe('conflict');
    act(() => result.current.reload());
    await waitFor(() => expect(studio.data.getDraft).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.save).toBe('saved'));
  });

  it('reports other save failures as an error that can be retried', async () => {
    const studio = fakeStudio({ draft: draftDoc(makeCourse(), { rev: 1 }) });
    studio.data.saveDraft = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(2);
    const { result } = setup(studio);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.update(rename('H')));
    await act(async () => {
      await result.current.saveNow();
    });
    expect(result.current.save).toBe('error');
    await act(async () => {
      expect(await result.current.saveNow()).toBe(true);
    });
    expect(result.current.save).toBe('saved');
  });

  it('asks the browser to confirm leaving with unsaved edits, and flushes on unmount', async () => {
    const { result, studio, unmount } = setup();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    act(() => result.current.update(rename('I')));
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
    unmount();
    await waitFor(() => expect(studio.data.saveDraft).toHaveBeenCalledTimes(1));
  });

  it('waits for a save in flight before the next page loads the draft', async () => {
    const studio = fakeStudio({ draft: draftDoc(makeCourse(), { rev: 4 }) });
    let finish: (rev: number) => void = () => undefined;
    let fail: (e: Error) => void = () => undefined;
    studio.data.saveDraft = vi
      .fn()
      .mockImplementationOnce(() => new Promise<number>((r) => (finish = r)))
      .mockImplementationOnce(() => new Promise<number>((_, r) => (fail = r)));
    const first = setup(studio);
    await waitFor(() => expect(first.result.current.status).toBe('ready'));
    act(() => first.result.current.update(rename('Q')));
    first.unmount();
    expect(studio.data.saveDraft).toHaveBeenCalledTimes(1);
    const calls = vi.mocked(studio.data.getDraft).mock.calls.length;
    const second = setup(studio);
    await act(async () => undefined);
    expect(studio.data.getDraft).toHaveBeenCalledTimes(calls);
    // A newer save on the same course replaces the first in the registry.
    await waitFor(() => expect(second.result.current.status).toBe('loading'));
    await act(async () => finish(5));
    await waitFor(() => expect(second.result.current.status).toBe('ready'));
    expect(studio.data.getDraft).toHaveBeenCalledTimes(calls + 1);
    act(() => second.result.current.update(rename('R')));
    second.unmount();
    await act(async () => fail(new Error('down')));
    const third = setup(studio);
    await waitFor(() => expect(third.result.current.status).toBe('ready'));
  });

  it('keeps the newest save registered when an older one settles first', async () => {
    const studio = fakeStudio({ draft: draftDoc(makeCourse(), { rev: 4 }) });
    const done: ((rev: number) => void)[] = [];
    studio.data.saveDraft = vi.fn(() => new Promise<number>((r) => done.push(r)));
    const a = setup(studio);
    const b = setup(studio);
    await waitFor(() => expect(a.result.current.status).toBe('ready'));
    await waitFor(() => expect(b.result.current.status).toBe('ready'));
    act(() => a.result.current.update(rename('A')));
    act(() => b.result.current.update(rename('B')));
    act(() => void a.result.current.saveNow());
    act(() => void b.result.current.saveNow());
    await act(async () => done[0]?.(5));
    const calls = vi.mocked(studio.data.getDraft).mock.calls.length;
    const c = setup(studio);
    await act(async () => undefined);
    expect(studio.data.getDraft).toHaveBeenCalledTimes(calls);
    await act(async () => done[1]?.(6));
    await waitFor(() => expect(c.result.current.status).toBe('ready'));
  });

  it('stops waiting for a save that never settles', async () => {
    const studio = fakeStudio({ draft: draftDoc(makeCourse(), { rev: 4 }) });
    studio.data.saveDraft = vi.fn(() => new Promise<number>(() => undefined));
    const first = setup(studio);
    await waitFor(() => expect(first.result.current.status).toBe('ready'));
    act(() => first.result.current.update(rename('S')));
    first.unmount();
    const second = setup(studio);
    await act(async () => undefined);
    expect(second.result.current.status).toBe('loading');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_WAIT_MS);
    });
    await waitFor(() => expect(second.result.current.status).toBe('ready'));
  });

  it('does not flush on unmount when nothing is unsaved', async () => {
    const { result, studio, unmount } = setup();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    unmount();
    expect(studio.data.saveDraft).not.toHaveBeenCalled();
  });
});

describe('useStudio', () => {
  it('throws outside its provider', () => {
    function Probe() {
      useStudio();
      return null;
    }
    const spy = console.error;
    console.error = () => {};
    expect(() => render(<Probe />)).toThrow(/inside <StudioProvider>/);
    console.error = spy;
  });
});
