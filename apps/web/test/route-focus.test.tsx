import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { forgetAsync, useAsync } from '../src/data/useAsync';
import type { Loadable } from '../src/data/useAsync';
import { Loaded } from '../src/learn/ui';
import { focusPageOnArrival, pageStart } from '../src/routeFocus';
import { openApp } from './harness';

function mount(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('pageStart', () => {
  it('picks the page heading and makes it focusable outside the Tab order', () => {
    const root = mount('<main><p>Intro</p><h1>Catalogue</h1></main>');
    const target = pageStart(root);
    expect(target?.tagName).toBe('H1');
    expect(target?.getAttribute('tabindex')).toBe('-1');
  });

  it('falls back to the main region, and keeps a tabindex it already has', () => {
    const root = mount('<main tabindex="0"><p>Loading</p></main>');
    const target = pageStart(root);
    expect(target?.tagName).toBe('MAIN');
    expect(target?.getAttribute('tabindex')).toBe('0');
  });

  it('is null before the page renders anything', () => {
    expect(pageStart(mount('<p>Loading</p>'))).toBeNull();
  });
});

describe('focusPageOnArrival', () => {
  it('focuses and announces a heading that is already there', () => {
    const root = mount('<main><h1>Changelog</h1></main>');
    const announce = vi.fn();
    focusPageOnArrival(root, announce)();
    expect(document.activeElement).toBe(root.querySelector('h1'));
    expect(announce).toHaveBeenCalledWith('Changelog');
  });

  it('waits for a heading that renders after the data loads', async () => {
    const root = mount('<main><p>Loading</p></main>');
    const announce = vi.fn();
    focusPageOnArrival(root, announce);
    root.querySelector('main')?.append(document.createElement('p'));
    await Promise.resolve();
    expect(announce).not.toHaveBeenCalled();
    const h1 = document.createElement('h1');
    h1.textContent = 'Git basics';
    root.querySelector('main')?.append(h1);
    await waitFor(() => expect(announce).toHaveBeenCalledWith('Git basics'));
    expect(document.activeElement).toBe(h1);
  });

  it('leaves focus where the person moved it, but still announces the page', async () => {
    const root = mount('<input aria-label="Elsewhere" /><main></main>');
    const announce = vi.fn();
    focusPageOnArrival(root, announce);
    const input = root.querySelector('input') as HTMLInputElement;
    input.focus();
    root.querySelector('main')?.append(document.createElement('h1'));
    await waitFor(() => expect(announce).toHaveBeenCalledWith(''));
    expect(document.activeElement).toBe(input);
  });

  it('stops waiting once cancelled', async () => {
    const root = mount('<main></main>');
    const announce = vi.fn();
    focusPageOnArrival(root, announce)();
    root.querySelector('main')?.append(document.createElement('h1'));
    await Promise.resolve();
    expect(announce).not.toHaveBeenCalled();
  });
});

describe('shell accessibility', () => {
  it('offers "Skip to content" first, landing on the page heading', async () => {
    await openApp('/changelog');
    const heading = await screen.findByRole('heading', { level: 1, name: 'Changelog' });
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(document.querySelector('a[href], button, input')).toBe(skip);
    fireEvent.click(skip);
    expect(document.activeElement).toBe(heading);
  });

  it('moves focus to the new page heading and announces it on navigation', async () => {
    const { router } = await openApp('/changelog');
    await screen.findByRole('heading', { level: 1, name: 'Changelog' });
    expect(document.activeElement).toBe(document.body);
    await act(() => router.navigate('/courses'));
    const heading = await screen.findByRole('heading', { level: 1, name: 'Catalogue' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe('Catalogue');
  });
});

describe('retry on load errors', () => {
  it('runs a failed load again', async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('ok');
    const { result } = renderHook(() => useAsync(load));
    await waitFor(() => expect(result.current.state).toBe('error'));
    const failed = result.current as Extract<Loadable<string>, { state: 'error' }>;
    act(() => failed.retry?.());
    expect(result.current.state).toBe('loading');
    await waitFor(() => expect(result.current).toEqual({ state: 'ready', value: 'ok' }));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('turns a rejection that is not an Error into one', async () => {
    const load = () => Promise.reject('offline');
    const { result } = renderHook(() => useAsync(load));
    await waitFor(() => expect(result.current.state).toBe('error'));
    expect((result.current as Extract<Loadable<string>, { state: 'error' }>).error.message).toBe(
      'offline',
    );
  });

  it('shows a Retry button on the load-error callout when the load can run again', () => {
    const retry = vi.fn();
    render(
      <Loaded loadable={{ state: 'error', error: new Error('Network down.'), retry }}>
        {() => null}
      </Loaded>,
    );
    expect(screen.getByRole('alert').textContent).toContain('Check your connection and try again.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('asks for a reload when the load cannot run again', () => {
    render(<Loaded loadable={{ state: 'error', error: new Error('Gone.') }}>{() => null}</Loaded>);
    expect(screen.getByRole('alert').textContent).toContain('reload the page');
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });
});

describe('useAsync with a key', () => {
  // A load must keep its identity across renders, or the hook runs it again.
  const ok = (v: string) => () => Promise.resolve(v);
  const failed = (v: Loadable<string>) => v as Extract<Loadable<string>, { state: 'error' }>;

  it('paints the last result at once on a new mount, then the fresh one', async () => {
    const first = renderHook(useAsync.bind(null, ok('old'), 'k'));
    await waitFor(() => expect(first.result.current).toEqual({ state: 'ready', value: 'old' }));
    first.unmount();
    const second = renderHook(useAsync.bind(null, ok('new'), 'k'));
    expect(second.result.current).toEqual({ state: 'ready', value: 'old' });
    await waitFor(() => expect(second.result.current).toEqual({ state: 'ready', value: 'new' }));
  });

  it('treats another key as a miss', async () => {
    const first = renderHook(useAsync.bind(null, ok('a'), 'one'));
    await waitFor(() => expect(first.result.current.state).toBe('ready'));
    const other = renderHook(useAsync.bind(null, ok('b'), 'two'));
    expect(other.result.current).toEqual({ state: 'loading' });
    await waitFor(() => expect(other.result.current.state).toBe('ready'));
  });

  it('keeps the shown value when the refresh fails, and a later refresh still works', async () => {
    const first = renderHook(useAsync.bind(null, ok('old'), 'k'));
    await waitFor(() => expect(first.result.current.state).toBe('ready'));
    first.unmount();
    let fail!: (e: Error) => void;
    const load = vi.fn(() => new Promise<string>((_, reject) => (fail = reject)));
    const second = renderHook(useAsync.bind(null, load, 'k'));
    expect(second.result.current).toEqual({ state: 'ready', value: 'old' });
    await act(async () => {
      fail(new Error('offline'));
    });
    expect(second.result.current).toEqual({ state: 'ready', value: 'old' });
    second.unmount();
    const third = renderHook(useAsync.bind(null, ok('new'), 'k'));
    expect(third.result.current).toEqual({ state: 'ready', value: 'old' });
    await waitFor(() => expect(third.result.current).toEqual({ state: 'ready', value: 'new' }));
  });

  it('stores nothing from a load that lands after the hook unmounted', async () => {
    let land!: (v: string) => void;
    const slow = () => new Promise<string>((resolve) => (land = resolve));
    const first = renderHook(useAsync.bind(null, slow, 'k'));
    first.unmount();
    await act(async () => {
      land('late');
    });
    const second = renderHook(useAsync.bind(null, ok('new'), 'k'));
    expect(second.result.current).toEqual({ state: 'loading' });
    await waitFor(() => expect(second.result.current.state).toBe('ready'));
  });

  it('shows the kept value while a new load runs under the same key', async () => {
    const hook = renderHook(({ load }) => useAsync(load, 'k'), {
      initialProps: { load: ok('old') },
    });
    await waitFor(() => expect(hook.result.current.state).toBe('ready'));
    hook.rerender({ load: ok('new') });
    expect(hook.result.current).toEqual({ state: 'ready', value: 'old' });
    await waitFor(() => expect(hook.result.current).toEqual({ state: 'ready', value: 'new' }));
  });

  it('ends ready with the load result under StrictMode, and keeps it once', async () => {
    const load = vi.fn(ok('v'));
    const first = renderHook(useAsync.bind(null, load, 'k'), { wrapper: StrictMode });
    await waitFor(() => expect(first.result.current).toEqual({ state: 'ready', value: 'v' }));
    first.unmount();
    const second = renderHook(useAsync.bind(null, ok('w'), 'k'));
    expect(second.result.current).toEqual({ state: 'ready', value: 'v' });
    await waitFor(() => expect(second.result.current).toEqual({ state: 'ready', value: 'w' }));
  });

  it('gives an error with retry when nothing was kept', async () => {
    const bad = () => Promise.reject<string>(new Error('offline'));
    const { result } = renderHook(() => useAsync(bad, 'k'));
    await waitFor(() => expect(result.current.state).toBe('error'));
    expect(failed(result.current).retry).toBeTypeOf('function');
  });

  it('forgets everything on forgetAsync', async () => {
    const first = renderHook(useAsync.bind(null, ok('old'), 'k'));
    await waitFor(() => expect(first.result.current.state).toBe('ready'));
    first.unmount();
    forgetAsync();
    const second = renderHook(useAsync.bind(null, ok('new'), 'k'));
    expect(second.result.current).toEqual({ state: 'loading' });
    await waitFor(() => expect(second.result.current.state).toBe('ready'));
  });

  it('keeps nothing without a key', async () => {
    const first = renderHook(useAsync.bind(null, ok('old')));
    await waitFor(() => expect(first.result.current.state).toBe('ready'));
    first.unmount();
    const second = renderHook(useAsync.bind(null, ok('new')));
    expect(second.result.current).toEqual({ state: 'loading' });
    await waitFor(() => expect(second.result.current.state).toBe('ready'));
  });
});
