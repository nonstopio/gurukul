import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAsync } from '../src/data/useAsync';
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
    const heading = await screen.findByRole('heading', { level: 1, name: 'Course catalogue' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe('Course catalogue');
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
