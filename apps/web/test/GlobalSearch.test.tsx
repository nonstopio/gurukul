import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalSearchProvider, SearchTrigger, isMac } from '../src/navigation/GlobalSearch';
import type {
  AreaNavigation,
  Destination,
  RecordLookup,
  RecordSource,
  Role,
} from '../src/navigation/types';
import { fakeConsole, userRow } from './fake-console';
import { openApp } from './harness';
import { axeViolations } from './axe';

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

  it('has no accessibility violations with the palette open', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    expect(dialog()).toBeTruthy();
    expect(await axeViolations(document.body)).toEqual([]);
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

const personRecord = (id: string, label: string): Destination => ({
  id: `person:${id}`,
  path: `/kulapati/learners?learner=${id}`,
  label,
  areaName: 'Learners',
  description: `${id}@example.com`,
  keywords: [],
  kind: 'Person',
});

describe('GlobalSearchProvider people lookups', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function withLookup(find: RecordLookup['find'], roles: Role[] = ['shishya', 'kulapati']) {
    const navigate = vi.fn();
    const lookups: RecordLookup[] = [{ id: 'people', roles: ['kulapati'], find }];
    const ui = (r: Role[]) => (
      <GlobalSearchProvider
        navigate={navigate}
        areas={areas}
        lookups={lookups}
        roles={r}
        mac={false}
      >
        <SearchTrigger />
      </GlobalSearchProvider>
    );
    const view = render(ui(roles));
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    return { navigate, rerender: (r: Role[]) => view.rerender(ui(r)) };
  }
  /** Let typing pause long enough for the lookup, then let its answer land. */
  const pause = async () => {
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    await act(async () => {});
  };

  it('looks up from two characters once typing pauses, and opens the person picked', async () => {
    const find = vi.fn(async () => [personRecord('asha', 'Asha Rao')]);
    const { navigate } = withLookup(find);
    expect(screen.getByRole('combobox').getAttribute('placeholder')).toBe(
      'Search pages, courses, lessons and people…',
    );
    type('a');
    await pause();
    expect(find).not.toHaveBeenCalled();
    type('As');
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    type('Ash');
    await pause();
    expect(find).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenCalledWith('ash');
    expect(options()).toEqual(['Asha RaoLearners · asha@example.comPerson']);
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(navigate).toHaveBeenCalledWith('/kulapati/learners?learner=asha');
  });

  it('shows only the newest lookup, and nothing once the query is too short', async () => {
    const first = deferred();
    const second = deferred();
    const find = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    withLookup(find);
    type('as');
    await pause();
    type('ra');
    await pause();
    await act(async () => second.resolve([personRecord('ravi', 'Ravi Rao')]));
    await act(async () => first.resolve([personRecord('asha', 'Asha Rao')]));
    expect(options()).toEqual(['Ravi RaoLearners · ravi@example.comPerson']);
    type('r');
    await pause();
    expect(options()).toEqual([]);
  });

  it('never looks up, or keeps, people for someone who is not a Kulapati', async () => {
    const find = vi.fn(async () => [personRecord('asha', 'Asha Rao')]);
    const { rerender } = withLookup(find);
    type('asha');
    await pause();
    expect(options()).toHaveLength(1);
    rerender(['shishya']);
    expect(options()).toEqual([]);
    expect(screen.getByRole('combobox').getAttribute('placeholder')).toBe(
      'Search pages, courses and lessons…',
    );
    type('asha r');
    await pause();
    expect(find).toHaveBeenCalledTimes(1);
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

describe('people in search, in the app', () => {
  it('finds a person for a Kulapati and opens their learner drawer', async () => {
    const asha = userRow(7, { displayName: 'Asha Rao' });
    const c = fakeConsole({ users: [asha], found: [asha], count: 1 });
    const { router } = await openApp('/', { roles: ['kulapati'], console: c });
    fireEvent.click(await screen.findByRole('button', { name: /Search/ }));
    type('asha');
    expect(await screen.findByRole('option', { name: /Asha Rao/ })).toBeTruthy();
    expect(c.data.searchUsers).toHaveBeenCalledWith('asha');
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(await screen.findByRole('dialog', { name: 'Asha Rao' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/kulapati/learners');
  });

  it('never searches people for a Shishya', async () => {
    const c = fakeConsole({});
    await openApp('/', { console: c });
    fireEvent.click(await screen.findByRole('button', { name: /Search/ }));
    type('asha');
    await act(() => new Promise((r) => setTimeout(r, 300)));
    expect(c.data.searchUsers).not.toHaveBeenCalled();
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
