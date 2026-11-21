import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthoringSession } from '@gurukul/schema';
import { analytics } from '../src/analytics';
import { REQUIRED_BRIDGE_VERSION } from '../src/desktop/bridge';
import { terms } from '../src/labels/terms';
import { sessionDestinations } from '../src/studio/session/search';
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
const OTHER = makeCourse({ id: 'other', title: 'Not mine', educatorIds: ['x'] });

function studio(over: { gitDraft?: boolean } = {}) {
  return fakeStudio({
    courses: [
      { live: GIT, draft: over.gitDraft === false ? null : draftDoc(GIT, { rev: 3 }) },
      { live: OTHER, draft: null },
    ],
  });
}

/** The desktop app's bridge in the page, with sessions already on disk if asked. */
async function desktopWith(
  sessions: Array<{ kind: 'new' } | { kind: 'edit'; courseId: string }> = [],
  info?: () => Promise<typeof DESKTOP_INFO>,
) {
  const fake = fakeDesktop(info ? { info } : {});
  const store = createSessionStore({ desktop: fake.desktop, uid: 'u1' });
  const made = [];
  for (const s of sessions) {
    const result = await store.start(
      s.kind === 'new' ? { kind: 'new' } : { kind: 'edit', courseId: s.courseId },
      async () => draftDoc(GIT, { rev: 3 }),
    );
    if (result.status === 'started') made.push(result.session);
  }
  vi.clearAllMocks();
  installDesktop(fake.desktop);
  return { ...fake, store, made };
}

describe('the Studio course list in a browser', () => {
  it('offers no session buttons, and no download card', async () => {
    await openApp('/studio', { roles: ['educator'], studio: studio() });
    expect(await screen.findByRole('link', { name: 'Git' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New course' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'New course with AI' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Edit with AI/ })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Build a course by chatting' })).toBeNull();
  });
});

describe('the Studio course list in the desktop app', () => {
  it('offers New course with AI, and Edit with AI on each course the person may edit', async () => {
    const d = await desktopWith();
    await openApp('/studio', { roles: ['educator'], studio: studio() });
    expect(await screen.findByRole('button', { name: 'New course with AI' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Edit with AI: Git' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit with AI: Not mine' })).toBeNull();
    // The app is already here: no download card.
    expect(screen.queryByRole('region', { name: 'Build a course by chatting' })).toBeNull();
    // The 30-day clean-up looks at this person's sessions on each visit.
    await waitFor(() => expect(d.desktop.store.list).toHaveBeenCalledWith({ uid: 'u1' }));
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('goes straight into a new edit session: one draft read, no write, no dialog', async () => {
    const d = await desktopWith();
    const track = vi.spyOn(analytics, 'track');
    const s = studio();
    const app = await openApp('/studio', { roles: ['educator'], studio: s });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit with AI: Git' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() =>
      expect(app.router.state.location.pathname).toMatch(/^\/studio\/sessions\/[0-9a-f-]{36}$/),
    );
    expect(s.data.getDraft).toHaveBeenCalledTimes(1);
    expect(s.data.saveDraft).not.toHaveBeenCalled();
    // No goal yet, and the course's own title until the agent sets one.
    expect(await screen.findByRole('heading', { level: 1, name: 'Git' })).toBeTruthy();
    // This fake shell has no agent: the workspace says the app needs its update.
    expect(await screen.findByRole('heading', { name: 'Update the app' })).toBeTruthy();
    const { sessions } = await d.store.list();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ title: 'Git', goals: [], courseId: 'git' });
    // Counted once, with its kind and nothing else: no course, no goal.
    expect(track.mock.calls.filter(([name]) => name === 'session_started')).toEqual([
      ['session_started', { kind: 'edit' }],
    ]);
    track.mockRestore();
  });

  it('opens the session already open on that course instead of starting a second', async () => {
    const d = await desktopWith([{ kind: 'edit', courseId: 'git' }]);
    const track = vi.spyOn(analytics, 'track');
    const s = studio();
    const app = await openApp('/studio', { roles: ['educator'], studio: s });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit with AI: Git' }));
    await waitFor(() =>
      expect(app.router.state.location.pathname).toBe(`/studio/sessions/${d.made[0]?.id}`),
    );
    expect(s.data.getDraft).not.toHaveBeenCalled();
    expect((await d.store.list()).sessions).toHaveLength(1);
    // Opening a session again is not starting one.
    expect(track).not.toHaveBeenCalledWith('session_started', expect.anything());
    track.mockRestore();
  });

  it('says so when the course has no draft, and writes nothing', async () => {
    const d = await desktopWith();
    const app = await openApp('/studio', {
      roles: ['educator'],
      studio: studio({ gitDraft: false }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit with AI: Git' }));
    expect(await screen.findByText(/has no draft you can open/)).toBeTruthy();
    expect(d.desktop.store.write).not.toHaveBeenCalled();
    expect(app.router.state.location.pathname).toBe('/studio');
  });

  it('says so when the start fails, and starts again on the next click', async () => {
    await desktopWith();
    const s = studio();
    const failure = new Error('offline');
    vi.mocked(s.data.getDraft).mockRejectedValueOnce(failure);
    const app = await openApp('/studio', { roles: ['educator'], studio: s });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit with AI: Git' }));
    expect(await screen.findByText('The session did not start. Try again.')).toBeTruthy();
    expect(log.error).toHaveBeenCalledWith('Session start failed', failure, { courseId: 'git' });
    expect(app.router.state.location.pathname).toBe('/studio');
    fireEvent.click(screen.getByRole('button', { name: 'Edit with AI: Git' }));
    await waitFor(() =>
      expect(app.router.state.location.pathname).toMatch(/^\/studio\/sessions\//),
    );
  });

  it('logs a clean-up that could not even list the sessions', async () => {
    const d = await desktopWith();
    const failure = new Error('store.list failed (EACCES)');
    d.desktop.store.list.mockRejectedValueOnce(failure);
    await openApp('/studio', { roles: ['educator'], studio: studio() });
    await waitFor(() => expect(log.error).toHaveBeenCalledWith('Session clean-up failed', failure));
  });

  it('starts a new course session with a plain title, and opens it', async () => {
    const d = await desktopWith([{ kind: 'edit', courseId: 'git' }]);
    const track = vi.spyOn(analytics, 'track');
    const s = studio();
    const app = await openApp('/studio', { roles: ['educator'], studio: s });
    fireEvent.click(await screen.findByRole('button', { name: 'New course with AI' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() =>
      expect(app.router.state.location.pathname).toMatch(/^\/studio\/sessions\//),
    );
    expect(s.data.getDraft).not.toHaveBeenCalled();
    expect(await screen.findByText('A new course: everything in it is added.')).toBeTruthy();
    const { sessions } = await d.store.list();
    expect(sessions).toHaveLength(2);
    expect(sessions.find((x) => x.kind === 'new')).toMatchObject({
      title: 'Untitled course',
      goals: [],
    });
    expect(track).toHaveBeenCalledWith('session_started', { kind: 'new' });
    track.mockRestore();
  });

  it('reuses the new course session nothing was done in, rather than piling up empty ones', async () => {
    const d = await desktopWith([{ kind: 'new' }]);
    const track = vi.spyOn(analytics, 'track');
    const app = await openApp('/studio', { roles: ['educator'], studio: studio() });
    fireEvent.click(await screen.findByRole('button', { name: 'New course with AI' }));
    await waitFor(() =>
      expect(app.router.state.location.pathname).toBe(`/studio/sessions/${d.made[0]?.id}`),
    );
    expect((await d.store.list()).sessions).toHaveLength(1);
    expect(track).not.toHaveBeenCalledWith('session_started', expect.anything());
    track.mockRestore();
  });

  it('starts another new course session when the open one already has work in it', async () => {
    const d = await desktopWith([{ kind: 'new' }]);
    const first = d.made[0] as AuthoringSession;
    await d.store.save({
      ...first,
      turns: [
        {
          id: 't1',
          at: first.createdAt,
          by: 'agent',
          summary: 'Added a lesson.',
          checkpoint: 't1.json',
          changes: 1,
        },
      ],
    });
    const app = await openApp('/studio', { roles: ['educator'], studio: studio() });
    fireEvent.click(await screen.findByRole('button', { name: 'New course with AI' }));
    await waitFor(async () => expect((await d.store.list()).sessions).toHaveLength(2));
    await waitFor(() =>
      expect(app.router.state.location.pathname).toMatch(/^\/studio\/sessions\//),
    );
    expect(app.router.state.location.pathname).not.toBe(`/studio/sessions/${first.id}`);
  });

  it('starts one session per click when React runs the effect twice, as in development', async () => {
    const d = await desktopWith();
    await openApp('/studio', { roles: ['educator'], studio: studio(), strict: true });
    fireEvent.click(await screen.findByRole('button', { name: 'New course with AI' }));
    await screen.findByText('A new course: everything in it is added.');
    expect((await d.store.list()).sessions).toHaveLength(1);
  });

  it('starts a new course for someone with no Google name, named from their email', async () => {
    const d = await desktopWith();
    await openApp('/studio', {
      roles: ['educator'],
      studio: studio(),
      user: { displayName: null },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'New course with AI' }));
    await waitFor(async () => expect((await d.store.list()).sessions).toHaveLength(1));
    // Named from the email, as `createCourse` will name them.
    expect((await d.store.list()).sessions[0]?.work.course.educatorNames).toEqual({ u1: 'priya' });
  });

  it('says so when the sessions on this computer cannot be read', async () => {
    const d = await desktopWith();
    const app = await openApp('/studio', { roles: ['educator'], studio: studio() });
    await waitFor(() => expect(d.desktop.store.list).toHaveBeenCalled());
    const failure = new Error('store.list failed (EACCES)');
    d.desktop.store.list.mockRejectedValueOnce(failure);
    fireEvent.click(await screen.findByRole('button', { name: 'New course with AI' }));
    expect(await screen.findByText('The session did not start. Try again.')).toBeTruthy();
    expect(log.error).toHaveBeenCalledWith('Session start failed', failure, { courseId: null });
    expect(app.router.state.location.pathname).toBe('/studio');
  });

  it('asks for an update when the app is too old for sessions', async () => {
    await desktopWith([], async () => ({
      ...DESKTOP_INFO,
      bridgeVersion: REQUIRED_BRIDGE_VERSION - 1,
    }));
    await openApp('/studio', { roles: ['educator'], studio: studio() });
    fireEvent.click(await screen.findByRole('button', { name: 'New course with AI' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Update Gurukul Studio')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('says when the app does not answer', async () => {
    await desktopWith([], () => Promise.reject(new Error('gone')));
    await openApp('/studio', { roles: ['educator'], studio: studio() });
    fireEvent.click(await screen.findByRole('button', { name: 'New course with AI' }));
    expect(await screen.findByText('The app did not answer')).toBeTruthy();
  });

  it('waits for the app to answer', async () => {
    await desktopWith([], () => new Promise(() => undefined));
    await openApp('/studio', { roles: ['educator'], studio: studio() });
    fireEvent.click(await screen.findByRole('button', { name: 'New course with AI' }));
    expect(await screen.findByLabelText('Checking the app')).toBeTruthy();
  });
});

describe('the session route in a browser', () => {
  it('says sessions need the desktop app, and where to get it', async () => {
    await openApp('/studio/sessions/abc', { roles: ['educator'], studio: studio() });
    expect(
      await screen.findByRole('heading', { name: 'Sessions open in the Gurukul Studio app' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Get the desktop app' }).getAttribute('href')).toBe(
      // One address for the releases, the download card's own (`download.ts`).
      'https://github.com/nonstopio/gurukul/releases',
    );
    expect(screen.getByRole('link', { name: 'Studio courses' }).getAttribute('href')).toBe(
      '/studio',
    );
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('is for Educators and Admins only', async () => {
    await openApp('/studio/sessions/abc', {});
    expect(await screen.findByText('You do not have access to this page.')).toBeTruthy();
  });
});

describe('the session route in the desktop app', () => {
  it('shows a saved session to read, with no message box and no agent', async () => {
    const d = await desktopWith([{ kind: 'edit', courseId: 'git' }]);
    const session = d.made[0] as AuthoringSession;
    await d.store.close(session, 'saved');
    await openApp(`/studio/sessions/${session.id}`, { roles: ['educator'], studio: studio() });
    expect(await screen.findByRole('heading', { level: 1, name: 'Git' })).toBeTruthy();
    expect(screen.getByText('Saved')).toBeTruthy();
    expect(screen.getByText('Nothing was said in this session.')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Ask for a change' })).toBeNull();
    expect(d.desktop.agent.status).not.toHaveBeenCalled();
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('shows a discarded session as such', async () => {
    const d = await desktopWith([{ kind: 'new' }]);
    await d.store.close(d.made[0] as AuthoringSession, 'discarded');
    await openApp(`/studio/sessions/${(d.made[0] as AuthoringSession).id}`, {
      roles: ['admin'],
      studio: studio(),
    });
    expect(await screen.findByText('Discarded')).toBeTruthy();
  });

  it('says when the session is not on this computer', async () => {
    await desktopWith();
    await openApp('/studio/sessions/missing', { roles: ['educator'], studio: studio() });
    expect(
      await screen.findByRole('heading', { name: 'This session is not on this computer' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to Studio' })).toBeTruthy();
  });

  it('offers Retry when the session file cannot be read', async () => {
    const d = await desktopWith([{ kind: 'new' }]);
    d.desktop.store.read.mockRejectedValueOnce(new Error('store.read failed (EIO)'));
    await openApp(`/studio/sessions/${(d.made[0] as AuthoringSession).id}`, {
      roles: ['educator'],
      studio: studio(),
    });
    expect(await screen.findByText('The app did not answer')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Untitled course' })).toBeTruthy();
  });

  it('asks for an update when the app is too old', async () => {
    await desktopWith([], async () => ({ ...DESKTOP_INFO, bridgeVersion: 0 }));
    await openApp('/studio/sessions/x', { roles: ['educator'], studio: studio() });
    expect(await screen.findByText('Update Gurukul Studio')).toBeTruthy();
  });

  it('says when the app does not answer', async () => {
    await desktopWith([], () => Promise.reject(new Error('gone')));
    await openApp('/studio/sessions/x', { roles: ['educator'], studio: studio() });
    expect(await screen.findByText('The app did not answer')).toBeTruthy();
  });

  it('waits for the app to answer', async () => {
    await desktopWith([], () => new Promise(() => undefined));
    await openApp('/studio/sessions/x', { roles: ['educator'], studio: studio() });
    expect(await screen.findAllByText('Opening the session')).not.toHaveLength(0);
  });
});

describe('sessions in global search', () => {
  it('are offered inside the desktop app and open the session', async () => {
    const d = await desktopWith([{ kind: 'edit', courseId: 'git' }, { kind: 'new' }]);
    const app = await openApp('/', { roles: ['educator'], studio: studio() });
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'session' } });
    const option = await screen.findByRole('option', { name: /Open session · Git/ });
    expect(option.textContent).toMatch(/Open session · Git/);
    fireEvent.click(option);
    await waitFor(() =>
      expect(app.router.state.location.pathname).toBe(`/studio/sessions/${d.made[0]?.id}`),
    );
  });

  it('are not asked for in a browser', async () => {
    const s = studio();
    await openApp('/', { roles: ['educator'], studio: s });
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'session' } });
    await waitFor(() => expect(s.data.listLiveCourses).toHaveBeenCalled());
    expect(screen.queryByRole('option', { name: /Session/ })).toBeNull();
  });

  it('describe each session by status and course, and offer none from an app too old', async () => {
    const d = await desktopWith([{ kind: 'new' }]);
    await d.store.close(d.made[0] as AuthoringSession, 'discarded');
    expect(await sessionDestinations('u1', terms('generic'))).toEqual([
      expect.objectContaining({
        label: 'Untitled course',
        description: 'Discarded session · a new course',
        kind: 'Session',
      }),
    ]);
    await act(async () => {
      d.desktop.info.mockResolvedValueOnce({ ...DESKTOP_INFO, bridgeVersion: 0 });
    });
    expect(await sessionDestinations('u1', terms('generic'))).toEqual([]);
  });
});
