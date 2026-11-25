import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REQUIRED_BRIDGE_VERSION } from '../src/desktop/bridge';
import {
  filterRows,
  historyRows,
  spanLabel,
  statusCounts,
  whenLabel,
} from '../src/studio/session/sessionHistory';
import { createSessionStore } from '../src/studio/session/store';
import { axeViolations } from './axe';
import { makeCourse } from './fake-data';
import { DESKTOP_INFO, fakeDesktop, installDesktop, uninstallDesktop } from './fake-desktop';
import { draftDoc, fakeStudio } from './fake-studio';
import { openApp } from './harness';

vi.mock('../src/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
const { log } = await import('../src/log');

afterEach(() => {
  uninstallDesktop();
  vi.clearAllMocks();
});

const GIT = makeCourse({ id: 'git', title: 'Git', educatorIds: ['u1'] });
const studio = () => fakeStudio({ courses: [{ live: GIT, draft: draftDoc(GIT, { rev: 3 }) }] });

const turn = (id: string, at: string, changes: number) => ({
  id,
  at,
  by: 'agent' as const,
  summary: 'Did something.',
  checkpoint: `${id}.json`,
  changes,
});

/** The bridge with: an open new course, a saved edit of Git, and a discarded session long since removed. */
async function withSessions(info?: () => Promise<typeof DESKTOP_INFO>) {
  const fake = fakeDesktop(info ? { info } : {});
  const store = createSessionStore({ desktop: fake.desktop, uid: 'u1' });
  const start = async (request: Parameters<typeof store.start>[0]) => {
    const r = await store.start(request, async () => draftDoc(GIT, { rev: 3 }));
    if (r.status !== 'started') throw new Error('not started');
    return r.session;
  };
  const fresh = await start({ kind: 'new' });
  const edit = await start({ kind: 'edit', courseId: 'git' });
  const old = await start({ kind: 'new' });
  await store.save({
    ...fresh,
    title: 'Docker basics',
    summary: 'Wrote the Docker chapter.',
    goals: [
      { text: 'a', done: true },
      { text: 'b', done: false },
    ],
    todos: [{ id: 'x', text: 'Add a picture', done: false, createdAt: fresh.createdAt }],
    turns: [turn('t1', fresh.createdAt, 2), turn('t2', fresh.createdAt, 1)],
  });
  await store.close({ ...old, title: 'Old idea' }, 'discarded');
  // Thirty days on, the old session's files are gone and only its record is left.
  await createSessionStore({
    desktop: fake.desktop,
    uid: 'u1',
    now: () => new Date(Date.now() + 31 * 24 * 3_600_000),
  }).sweep();
  await store.close(
    { ...edit, summary: 'Simplified rebase.', turns: [turn('t1', edit.createdAt, 1)] },
    'saved',
  );
  vi.clearAllMocks();
  installDesktop(fake.desktop);
  return { ...fake, store, fresh, edit, old };
}

describe('the session history model', () => {
  it('formats a moment and a span in words', () => {
    expect(whenLabel('2026-11-25T14:30:00.000Z')).toMatch(/^25 Nov 2026, \d\d:\d\d$/);
    const from = '2026-11-25T10:00:00.000Z';
    expect(spanLabel(from, from)).toBe('Under a minute');
    expect(spanLabel(from, '2026-11-25T10:35:00.000Z')).toBe('35 min');
    expect(spanLabel(from, '2026-11-25T12:00:00.000Z')).toBe('2 h');
    expect(spanLabel(from, '2026-11-25T12:05:00.000Z')).toBe('2 h 5 min');
    expect(spanLabel(from, '2026-11-26T10:00:00.000Z')).toBe('1 day');
    expect(spanLabel(from, '2026-11-28T10:00:00.000Z')).toBe('3 days');
    expect(spanLabel('2026-11-25T12:00:00.000Z', from)).toBe('Under a minute');
  });

  it('merges live sessions and removed ones, newest activity first, and filters them', async () => {
    const d = await withSessions();
    const rows = historyRows(await d.store.list());
    expect(rows.map((r) => r.title)).toEqual(
      expect.arrayContaining(['Docker basics', 'Git', 'Old idea']),
    );
    expect(rows).toHaveLength(3);
    const sorted = [...rows].sort((a, b) => b.endedAt.localeCompare(a.endedAt));
    expect(rows).toEqual(sorted);
    expect(statusCounts(rows)).toEqual({ all: 3, open: 1, saved: 1, discarded: 1 });
    const old = rows.find((r) => r.title === 'Old idea');
    expect(old).toMatchObject({ removed: true, status: 'discarded', course: null });
    const docker = rows.find((r) => r.title === 'Docker basics');
    expect(docker).toMatchObject({ turns: 2, changes: 3, goals: 2, goalsDone: 1, todosLeft: 1 });
    expect(rows.find((r) => r.title === 'Git')?.course).toBe('Git');
    expect(filterRows(rows, 'saved', '').map((r) => r.title)).toEqual(['Git']);
    expect(filterRows(rows, 'all', 'DOCKER chapter').map((r) => r.title)).toEqual([
      'Docker basics',
    ]);
    expect(filterRows(rows, 'all', 'git rebase').map((r) => r.title)).toEqual(['Git']);
    expect(filterRows(rows, 'open', 'old')).toEqual([]);
  });
});

describe('the session history page', () => {
  const rowsOf = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

  it('lists every session with its details, and opens one that still has its files', async () => {
    const d = await withSessions();
    const app = await openApp('/studio/sessions', { roles: ['educator'], studio: studio() });
    expect(await screen.findByRole('heading', { level: 1, name: 'Session history' })).toBeTruthy();
    const table = await screen.findByRole('table', { name: 'Sessions on this computer' });
    expect(rowsOf()).toHaveLength(3);
    expect(within(table).getByText('Wrote the Docker chapter.')).toBeTruthy();
    expect(within(table).getByText('2 turns · 3 changes')).toBeTruthy();
    expect(within(table).getByText('1 of 2 done · 1 left for you')).toBeTruthy();
    expect(within(table).getAllByText('None set').length).toBeGreaterThan(0);
    expect(within(table).getAllByText('New course')).toHaveLength(2);
    expect(within(table).getByText('1 turn · 1 change')).toBeTruthy();
    expect(screen.getByText('3 of 3')).toBeTruthy();
    // A removed session is a record, not a link.
    expect(within(table).queryByRole('link', { name: 'Old idea' })).toBeNull();
    expect(
      within(table).getAllByText(/Chat and files removed 30 days after it closed/),
    ).toHaveLength(1);
    // Local files only.
    expect(d.desktop.store.list).toHaveBeenCalledWith({ uid: 'u1' });
    expect(await axeViolations(document.body)).toEqual([]);
    fireEvent.click(within(table).getByRole('link', { name: 'Git' }));
    await waitFor(() =>
      expect(app.router.state.location.pathname).toBe(`/studio/sessions/${d.edit.id}`),
    );
  });

  it('keeps the record of a removed edit, whose course is no longer known', async () => {
    const fake = fakeDesktop();
    const store = createSessionStore({ desktop: fake.desktop, uid: 'u1' });
    const r = await store.start({ kind: 'edit', courseId: 'git' }, async () =>
      draftDoc(GIT, { rev: 3 }),
    );
    if (r.status !== 'started') throw new Error('not started');
    await store.close(
      { ...r.session, title: 'Tidy rebase', goals: [{ text: 'a', done: true }] },
      'saved',
    );
    await createSessionStore({
      desktop: fake.desktop,
      uid: 'u1',
      now: () => new Date(Date.now() + 31 * 24 * 3_600_000),
    }).sweep();
    installDesktop(fake.desktop);
    await openApp('/studio/sessions', { roles: ['educator'], studio: studio() });
    const table = await screen.findByRole('table', { name: 'Sessions on this computer' });
    expect(within(table).getByText('Tidy rebase')).toBeTruthy();
    expect(within(table).getByText('Edit (course not kept)')).toBeTruthy();
    // Every goal done and nothing left for the Educator: no "left for you".
    expect(within(table).getByText('1 of 1 done')).toBeTruthy();
  });

  it('searches, filters by status, and clears both', async () => {
    await withSessions();
    const app = await openApp('/studio/sessions', { roles: ['educator'], studio: studio() });
    await screen.findByRole('table');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search sessions' }), {
      target: { value: 'docker' },
    });
    expect(rowsOf()).toHaveLength(1);
    expect(screen.getByText('1 of 3')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search sessions' }), {
      target: { value: 'nothing like this' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Show every session' }));
    expect(rowsOf()).toHaveLength(3);
    // The status lives in the address, so a reload keeps it.
    fireEvent.click(screen.getByRole('combobox', { name: 'Status' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Saved (1)' }));
    expect(rowsOf()).toHaveLength(1);
    expect(app.router.state.location.search).toBe('?status=saved');
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(rowsOf()).toHaveLength(3);
    expect(app.router.state.location.search).toBe('');
  });

  it('opens on the status named in the address', async () => {
    await withSessions();
    await openApp('/studio/sessions?status=open', { roles: ['educator'], studio: studio() });
    await screen.findByRole('table');
    expect(rowsOf()).toHaveLength(1);
    expect(screen.getByText('Docker basics')).toBeTruthy();
  });

  it('says so when there is no session yet', async () => {
    installDesktop(fakeDesktop().desktop);
    await openApp('/studio/sessions', { roles: ['educator'], studio: studio() });
    expect(await screen.findByRole('heading', { name: 'No sessions yet' })).toBeTruthy();
  });

  it('says when the sessions cannot be read, logs it, and tries again', async () => {
    const d = await withSessions();
    const failure = new Error('store.list failed (EACCES)');
    d.desktop.store.list.mockRejectedValueOnce(failure);
    await openApp('/studio/sessions', { roles: ['educator'], studio: studio() });
    expect(
      await screen.findByText('Your sessions on this computer could not be read'),
    ).toBeTruthy();
    expect(log.error).toHaveBeenCalledWith('Session history failed', failure);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('table')).toBeTruthy();
  });

  it('shows 25 sessions to a page', async () => {
    const d = await withSessions();
    for (let i = 0; i < 24; i += 1) await d.store.start({ kind: 'new' }, async () => null);
    await openApp('/studio/sessions', { roles: ['educator'], studio: studio() });
    await screen.findByRole('table');
    expect(rowsOf()).toHaveLength(25);
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(rowsOf()).toHaveLength(2);
  });

  it('waits for the app to answer', async () => {
    installDesktop(fakeDesktop({ info: () => new Promise(() => undefined) }).desktop);
    await openApp('/studio/sessions', { roles: ['educator'], studio: studio() });
    expect(await screen.findByText('Reading sessions')).toBeTruthy();
  });

  it('asks for an update when the app is too old', async () => {
    installDesktop(
      fakeDesktop({
        info: async () => ({ ...DESKTOP_INFO, bridgeVersion: REQUIRED_BRIDGE_VERSION - 1 }),
      }).desktop,
    );
    await openApp('/studio/sessions', { roles: ['educator'], studio: studio() });
    expect(await screen.findByText('Update Gurukul Studio')).toBeTruthy();
  });

  it('says when the app does not answer', async () => {
    installDesktop(fakeDesktop({ info: () => Promise.reject(new Error('gone')) }).desktop);
    await openApp('/studio/sessions', { roles: ['educator'], studio: studio() });
    expect(await screen.findByText('The app did not answer')).toBeTruthy();
  });
});

describe('Session history outside the app, and the way in', () => {
  it('tells a browser that sessions need the desktop app', async () => {
    await openApp('/studio/sessions', { roles: ['educator'], studio: studio() });
    expect(
      await screen.findByRole('heading', { name: 'Sessions open in the Gurukul Studio app' }),
    ).toBeTruthy();
  });

  it('is for Educators and Admins only', async () => {
    await openApp('/studio/sessions', {});
    expect(await screen.findByText('You do not have access to this page.')).toBeTruthy();
  });

  it('is linked from the course list in the app, and not in a browser', async () => {
    await openApp('/studio', { roles: ['educator'], studio: studio() });
    expect(await screen.findByRole('link', { name: 'Git' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Session history' })).toBeNull();
    uninstallDesktop();
    installDesktop(fakeDesktop().desktop);
    await openApp('/studio', { roles: ['educator'], studio: studio() });
    const link = await screen.findByRole('link', { name: 'Session history' });
    expect(link.getAttribute('href')).toBe('/studio/sessions');
  });
});
