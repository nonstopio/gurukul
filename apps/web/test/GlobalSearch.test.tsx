import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GlobalSearchProvider, SearchTrigger, isMac } from '../src/navigation/GlobalSearch';
import type { AreaNavigation, Destination, RecordSource, Role } from '../src/navigation/types';
import { openApp } from './harness';

const areas: AreaNavigation[] = [
  {
    slug: 'platform',
    name: 'Gurukul',
    pages: [
      { id: 'home', path: '/', label: 'Home' },
      { id: 'changelog', path: '/changelog', label: 'Changelog', description: 'Every change' },
      { id: 'secret', path: '/kulapati', label: 'Kulapati console', roles: ['kulapati'] },
    ],
  },
];

function setup(props: { mac?: boolean } = {}) {
  const navigate = vi.fn();
  render(
    <GlobalSearchProvider navigate={navigate} areas={areas} mac={props.mac ?? false}>
      <SearchTrigger />
    </GlobalSearchProvider>,
  );
  return { navigate };
}
const key = (init: KeyboardEventInit) =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, ...init }));
  });
const dialog = () => screen.queryByRole('dialog', { name: 'Search Gurukul' });

describe('GlobalSearchProvider', () => {
  it('opens from the trigger and lists only pages this person can open', () => {
    setup();
    const trigger = screen.getByRole('button', { name: /Search/ });
    expect(trigger.getAttribute('aria-keyshortcuts')).toBe('Control+K');
    expect(trigger.textContent).toContain('Ctrl K');
    fireEvent.click(trigger);
    expect(dialog()).toBeTruthy();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['HomeGurukulPage', 'ChangelogGurukul · Every changePage']);
  });

  it('navigates to the chosen page and closes', () => {
    const { navigate } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'change' } });
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(navigate).toHaveBeenCalledWith('/changelog');
    expect(dialog()).toBeNull();
  });

  it('toggles with Ctrl+K (or the K key on any layout) and ignores other chords', () => {
    setup();
    key({ key: 'k', ctrlKey: true });
    expect(dialog()).toBeTruthy();
    key({ key: 'л', code: 'KeyK', ctrlKey: true });
    expect(dialog()).toBeNull();
    key({ key: 'k' });
    key({ key: 'k', ctrlKey: true, shiftKey: true });
    key({ key: 'k', ctrlKey: true, altKey: true });
    key({ key: 'j', ctrlKey: true });
    key({ key: 'k', metaKey: true });
    expect(dialog()).toBeNull();
  });

  it('survives a keydown with no key, as browser autofill sends', () => {
    setup();
    act(() => {
      window.dispatchEvent(new Event('keydown'));
    });
    expect(dialog()).toBeNull();
  });

  it('uses Cmd+K on a Mac', () => {
    setup({ mac: true });
    expect(screen.getByRole('button', { name: /Search/ }).getAttribute('aria-keyshortcuts')).toBe(
      'Meta+K',
    );
    key({ key: 'k', ctrlKey: true });
    expect(dialog()).toBeNull();
    key({ key: 'K', metaKey: true });
    expect(dialog()).toBeTruthy();
  });

  it('closes on Escape', () => {
    setup();
    key({ key: 'k', ctrlKey: true });
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    expect(dialog()).toBeNull();
  });

  it('uses the real areas and the Shishya role by default', () => {
    render(
      <GlobalSearchProvider navigate={vi.fn()}>
        <SearchTrigger />
      </GlobalSearchProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
  });
});

const record = (id: string, label: string): Destination => ({
  id,
  path: `/courses/${id}`,
  label,
  areaName: 'Catalogue',
  description: '',
  keywords: [],
  kind: 'Course',
});

function deferred() {
  let resolve: (d: Destination[]) => void = () => {};
  const promise = new Promise<Destination[]>((r) => (resolve = r));
  return { promise, resolve };
}

const type = (value: string) =>
  fireEvent.change(screen.getByRole('combobox'), { target: { value } });
const options = () => screen.queryAllByRole('option').map((o) => o.textContent);

describe('GlobalSearchProvider record results', () => {
  function withSources(sources: RecordSource[], roles: Role[] = ['shishya']) {
    const navigate = vi.fn();
    const ui = (r: Role[]) => (
      <GlobalSearchProvider
        navigate={navigate}
        areas={areas}
        sources={sources}
        roles={r}
        mac={false}
      >
        <SearchTrigger />
      </GlobalSearchProvider>
    );
    const view = render(ui(roles));
    return { navigate, rerender: (r: Role[]) => view.rerender(ui(r)) };
  }
  const open = () => fireEvent.click(screen.getByRole('button', { name: /Search/ }));

  it('loads nothing until search opens, then once, and ranks records with the pages', async () => {
    const load = vi.fn(async () => [record('git', 'Git, the NonStop Way')]);
    const { navigate } = withSources([{ id: 'courses', load }]);
    expect(load).not.toHaveBeenCalled();
    open();
    await act(async () => {});
    // An empty query lists pages only: records appear when someone types.
    expect(options()).toEqual(['HomeGurukulPage', 'ChangelogGurukul · Every changePage']);
    type('git');
    expect(options()).toEqual(['Git, the NonStop WayCatalogueCourse']);
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(navigate).toHaveBeenCalledWith('/courses/git');
    open();
    await act(async () => {});
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('keeps a load that finishes after search closed', async () => {
    const d = deferred();
    withSources([{ id: 'courses', load: () => d.promise }]);
    open();
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    await act(async () => d.resolve([record('git', 'Git')]));
    open();
    type('git');
    expect(options()).toEqual(['GitCatalogueCourse']);
  });

  it('never shows records loaded for other roles, even when that load lands last', async () => {
    const first = deferred();
    const second = deferred();
    const load = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { rerender } = withSources([{ id: 'courses', load }]);
    open();
    await act(async () => {});
    rerender(['shishya', 'kulapati']);
    await act(async () => {});
    expect(load).toHaveBeenCalledTimes(2);
    await act(async () => second.resolve([record('new', 'Newer')]));
    await act(async () => first.resolve([record('old', 'Older')]));
    type('er');
    expect(options()).toEqual(['NewerCatalogueCourse']);
  });
});

describe('global search in the app', () => {
  it('finds a lesson of a published course and opens it', async () => {
    const { router, data } = await openApp('/');
    fireEvent.click(await screen.findByRole('button', { name: /Search/ }));
    await act(async () => {});
    expect(data.data.listCourses).toHaveBeenCalled();
    type('lesson l3');
    expect(options()[0]).toBe('Lesson l3Git, the NonStop Way · HistoryLesson');
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(router.state.location.pathname).toBe('/courses/git/learn/l3');
  });
});

describe('SearchTrigger', () => {
  it('renders nothing outside the provider', () => {
    const { container } = render(<SearchTrigger />);
    expect(container.innerHTML).toBe('');
  });
});

describe('isMac', () => {
  it('reads the platform, falling back to the user agent', () => {
    expect(isMac({ platform: 'MacIntel', userAgent: '' })).toBe(true);
    expect(isMac({ platform: '', userAgent: 'Mozilla (iPhone)' })).toBe(true);
    expect(isMac({ platform: 'Win32', userAgent: 'Windows' })).toBe(false);
    expect(typeof isMac()).toBe('boolean');
  });
});
