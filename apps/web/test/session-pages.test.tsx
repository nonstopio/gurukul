import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthoringSession } from '@gurukul/schema';
import { REQUIRED_BRIDGE_VERSION } from '../src/desktop/bridge';
import { terms } from '../src/labels/terms';
import { DESKTOP_RELEASES_URL } from '../src/studio/SessionRoute';
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
  for (const [i, s] of sessions.entries()) {
    const result = await store.start(
      s.kind === 'new'
        ? { kind: 'new', goal: `A new course number ${i + 1}.` }
        : { kind: 'edit', courseId: s.courseId, goal: 'Simplify the basics.' },
      async () => draftDoc(GIT, { rev: 3 }),
    );
    if (result.status === 'started') made.push(result.session);
  }
  vi.clearAllMocks();
  installDesktop(fake.desktop);
  return { ...fake, store, made };
}

describe('the Studio course list in a browser', () => {
  it('offers no session buttons', async () => {
    await openApp('/studio', { roles: ['educator'], studio: studio() });
    expect(await screen.findByRole('link', { name: 'Git' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New course' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'New course with AI' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Edit with AI/ })).toBeNull();
  });
});

describe('the Studio course list in the desktop app', () => {
  it('offers New course with AI, and Edit with AI on each course the person may edit', async () => {
    const d = await desktopWith();
    await openApp('/studio', { roles: ['educator'], studio: studio() });
    expect(await screen.findByRole('button', { name: 'New course with AI' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Edit with AI: Git' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit with AI: Not mine' })).toBeNull();
    // The 30-day clean-up looks at this person's sessions on each visit.
    await waitFor(() => expect(d.desktop.store.list).toHaveBeenCalledWith({ uid: 'u1' }));
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('starts an edit session from one draft read, with no write, and opens it', async () => {
    const d = await desktopWith();
    const s = studio();
    const app = await openApp('/studio', { roles: ['educator'], studio: s });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit with AI: Git' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit “Git” with AI' });
    const goal = await within(dialog).findByRole('textbox', { name: 'What do you want to do?' });
    const start = within(dialog).getByRole('button', { name: 'Start session' });
    expect((start as HTMLButtonElement).disabled).toBe(true);
    expect(within(dialog).getByText(/what you write are sent to Anthropic/)).toBeTruthy();
    expect(await axeViolations(document.body)).toEqual([]);
    fireEvent.change(goal, { target: { value: 'Make the basics shorter. Then a Quiz.' } });
    fireEvent.click(start);
    await waitFor(() =>
      expect(app.router.state.location.pathname).toMatch(/^\/studio\/sessions\/[0-9a-f-]{36}$/),
    );
    expect(s.data.getDraft).toHaveBeenCalledTimes(1);
    expect(s.data.saveDraft).not.toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: 'Make the basics shorter.' })).toBeTruthy();
    expect(screen.getByText('Make the basics shorter. Then a Quiz.')).toBeTruthy();
    expect(screen.getByText('Changing the draft of “Git”.')).toBeTruthy();
    expect(screen.getByText('The workspace opens here')).toBeTruthy();
    expect((await d.store.list()).sessions).toHaveLength(1);
  });

  it('offers to open the session already open on that course instead of a second', async () => {
    const d = await desktopWith([{ kind: 'edit', courseId: 'git' }]);
    const s = studio();
    const app = await openApp('/studio', { roles: ['educator'], studio: s });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit with AI: Git' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByText('You already have a session on this course'),
    ).toBeTruthy();
    expect(within(dialog).queryByRole('textbox')).toBeNull();
    fireEvent.click(within(dialog).getByRole('link', { name: 'Open the session' }));
    await waitFor(() =>
      expect(app.router.state.location.pathname).toBe(`/studio/sessions/${d.made[0]?.id}`),
    );
    expect(s.data.getDraft).not.toHaveBeenCalled();
  });

  it('turns to that offer when a session opened on the course while the dialog was up', async () => {
    const d = await desktopWith([{ kind: 'edit', courseId: 'git' }]);
    await openApp('/studio', { roles: ['educator'], studio: studio() });
    await waitFor(() => expect(d.desktop.store.list).toHaveBeenCalled());
    // The dialog's own look finds nothing; the start then finds the open one.
    d.desktop.store.list.mockResolvedValueOnce([]);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit with AI: Git' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(await within(dialog).findByRole('textbox'), { target: { value: 'Go.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start session' }));
    expect(
      await within(dialog).findByText('You already have a session on this course'),
    ).toBeTruthy();
  });

  it('says so when the course has no draft, and writes nothing', async () => {
    const d = await desktopWith();
    await openApp('/studio', { roles: ['educator'], studio: studio({ gitDraft: false }) });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit with AI: Git' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(await within(dialog).findByRole('textbox'), { target: { value: 'Go.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start session' }));
    expect(await within(dialog).findByText(/has no draft you can open/)).toBeTruthy();
    expect(d.desktop.store.write).not.toHaveBeenCalled();
  });

  it('says so when the start fails, and lets the person try again', async () => {
    await desktopWith();
    const s = studio();
    const failure = new Error('offline');
    vi.mocked(s.data.getDraft).mockRejectedValueOnce(failure);
    await openApp('/studio', { roles: ['educator'], studio: s });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit with AI: Git' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(await within(dialog).findByRole('textbox'), { target: { value: 'Go.' } });
    // Enter on a blank goal sends nothing.
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '  ' } });
    fireEvent.submit(within(dialog).getByRole('textbox').closest('form') as HTMLFormElement);
    expect(s.data.getDraft).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Go.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start session' }));
    expect(await within(dialog).findByText('The session did not start. Try again.')).toBeTruthy();
    expect(log.error).toHaveBeenCalledWith('Session start failed', failure, { courseId: 'git' });
    expect(
      (within(dialog).getByRole('button', { name: 'Start session' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('says so when the sessions on this computer cannot be read', async () => {
    const d = await desktopWith();
    await openApp('/studio', { roles: ['educator'], studio: studio() });
    await waitFor(() => expect(d.desktop.store.list).toHaveBeenCalled());
    const failure = new Error('store.list failed (EACCES)');
    d.desktop.store.list.mockRejectedValueOnce(failure);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit with AI: Git' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Your sessions could not be read')).toBeTruthy();
    expect(log.error).toHaveBeenCalledWith('Session list failed', failure);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('logs a clean-up that could not even list the sessions', async () => {
    const d = await desktopWith();
    const failure = new Error('store.list failed (EACCES)');
    d.desktop.store.list.mockRejectedValueOnce(failure);
    await openApp('/studio', { roles: ['educator'], studio: studio() });
    await waitFor(() => expect(log.error).toHaveBeenCalledWith('Session clean-up failed', failure));
  });

  it('starts a new course, offering the new courses already started', async () => {
    const d = await desktopWith([{ kind: 'new' }, { kind: 'edit', courseId: 'git' }]);
    const s = studio();
    const app = await openApp('/studio', { roles: ['educator'], studio: s });
    fireEvent.click(await screen.findByRole('button', { name: 'New course with AI' }));
    const dialog = await screen.findByRole('dialog', { name: 'New course with AI' });
    const resume = await within(dialog).findByRole('navigation', { name: 'Open sessions' });
    expect(
      within(resume)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['A new course number 1.']);
    fireEvent.change(within(dialog).getByRole('textbox'), {
      target: { value: 'A course on code review.' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start session' }));
    await waitFor(() =>
      expect(app.router.state.location.pathname).toMatch(/^\/studio\/sessions\//),
    );
    expect(s.data.getDraft).not.toHaveBeenCalled();
    expect(
      await screen.findByText('A new course: its title and address are settled at the first save.'),
    ).toBeTruthy();
    expect((await d.store.list()).sessions).toHaveLength(3);
  });

  it('starts a new course for someone with no Google name', async () => {
    const d = await desktopWith();
    await openApp('/studio', {
      roles: ['educator'],
      studio: studio(),
      user: { displayName: null },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'New course with AI' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(await within(dialog).findByRole('textbox'), { target: { value: 'Go.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start session' }));
    await waitFor(async () => expect((await d.store.list()).sessions).toHaveLength(1));
    expect((await d.store.list()).sessions[0]?.work.course.educatorNames).toEqual({});
  });

  it('drops the look for open sessions when the dialog closes first', async () => {
    const d = await desktopWith();
    await openApp('/studio', { roles: ['educator'], studio: studio() });
    await waitFor(() => expect(d.desktop.store.list).toHaveBeenCalled());
    let answer: (ids: string[]) => void = () => undefined;
    d.desktop.store.list.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    fireEvent.click(await screen.findByRole('button', { name: 'New course with AI' }));
    expect(await screen.findByLabelText('Looking for open sessions')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await act(async () => answer([]));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens a new course already started from the dialog', async () => {
    const d = await desktopWith([{ kind: 'new' }]);
    const app = await openApp('/studio', { roles: ['educator'], studio: studio() });
    fireEvent.click(await screen.findByRole('button', { name: 'New course with AI' }));
    fireEvent.click(await screen.findByRole('link', { name: 'A new course number 1.' }));
    await waitFor(() =>
      expect(app.router.state.location.pathname).toBe(`/studio/sessions/${d.made[0]?.id}`),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
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

describe('the start dialog’s Sources folder', () => {
  async function openEdit() {
    const d = await desktopWith();
    const app = await openApp('/studio', { roles: ['educator'], studio: studio() });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit with AI: Git' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit “Git” with AI' });
    const group = await within(dialog).findByRole('group', { name: 'Sources folder' });
    return { d, app, dialog, group };
  }

  it('offers a folder, says what is sent to Anthropic, and starts the session it chose for', async () => {
    const { d, app, dialog, group } = await openEdit();
    expect(within(group).getByText(/What it reads is sent to Anthropic too/)).toBeTruthy();
    fireEvent.click(within(group).getByRole('button', { name: 'Choose a Sources folder' }));
    expect(await within(group).findByText('~/Material')).toBeTruthy();
    expect(within(group).getByText('2 files')).toBeTruthy();
    const [ref] = d.desktop.sources.choose.mock.calls[0] ?? [];
    expect(ref).toEqual({
      uid: 'u1',
      sessionId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      suggestedName: 'git',
    });
    expect(await axeViolations(document.body)).toEqual([]);

    fireEvent.click(within(group).getByRole('button', { name: 'Show in Finder' }));
    expect(d.desktop.sources.reveal).toHaveBeenCalledWith({ uid: 'u1', sessionId: ref?.sessionId });
    fireEvent.click(within(group).getByRole('button', { name: 'Change folder' }));
    await waitFor(() => expect(d.desktop.sources.choose).toHaveBeenCalledTimes(2));
    expect(d.desktop.sources.choose.mock.calls[1]?.[0]).toEqual(ref);

    // The session starts under the id its folder was chosen for, so the agent works in it.
    fireEvent.change(within(dialog).getByRole('textbox'), {
      target: { value: 'Make the basics shorter.' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start session' }));
    await waitFor(() =>
      expect(app.router.state.location.pathname).toBe(`/studio/sessions/${ref?.sessionId}`),
    );
    expect(d.desktop.sources.choose).toHaveBeenCalledTimes(2);
  });

  it('suggests no folder name for a new course', async () => {
    const d = await desktopWith();
    await openApp('/studio', { roles: ['educator'], studio: studio() });
    fireEvent.click(await screen.findByRole('button', { name: 'New course with AI' }));
    const dialog = await screen.findByRole('dialog', { name: 'New course with AI' });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Choose a Sources folder' }));
    await within(dialog).findByText('~/Material');
    expect(d.desktop.sources.choose.mock.calls[0]?.[0]).toEqual({
      uid: 'u1',
      sessionId: expect.any(String),
    });
  });

  it('keeps offering the folder when the Educator cancels the system dialog', async () => {
    const { d, group } = await openEdit();
    d.desktop.sources.choose.mockResolvedValueOnce(null);
    const choose = within(group).getByRole('button', { name: 'Choose a Sources folder' });
    fireEvent.click(choose);
    await waitFor(() => expect((choose as HTMLButtonElement).disabled).toBe(false));
    expect(within(group).queryByText('~/Material')).toBeNull();
  });

  it('says to update an app too old for a Sources folder', async () => {
    const { d, group } = await openEdit();
    d.desktop.sources.choose.mockRejectedValueOnce(
      new Error('Error invoking remote method: Error: Not available in this version'),
    );
    fireEvent.click(within(group).getByRole('button', { name: 'Choose a Sources folder' }));
    expect(
      await screen.findByText(/cannot use a Sources folder. Choose Check for updates/),
    ).toBeTruthy();
    expect(log.error).toHaveBeenCalledWith('Sources folder not chosen', expect.any(Error), {
      sessionId: expect.any(String),
    });
  });

  it('asks for another folder when the app refuses the one picked', async () => {
    const { d, group } = await openEdit();
    d.desktop.sources.choose.mockRejectedValueOnce(
      new Error(
        'Error invoking remote method: Error: Choose a folder outside Gurukul Studio’s own data.',
      ),
    );
    fireEvent.click(within(group).getByRole('button', { name: 'Choose a Sources folder' }));
    expect(await screen.findByText('That folder cannot be used. Choose another one.')).toBeTruthy();
  });

  it('says when the folder cannot be shown', async () => {
    const { d, group } = await openEdit();
    fireEvent.click(within(group).getByRole('button', { name: 'Choose a Sources folder' }));
    await within(group).findByText('~/Material');
    d.desktop.sources.reveal.mockRejectedValueOnce(new Error('sources.reveal failed'));
    fireEvent.click(within(group).getByRole('button', { name: 'Show in Finder' }));
    expect(await screen.findByText('The folder could not be opened.')).toBeTruthy();
    expect(log.error).toHaveBeenCalledWith('Sources folder not shown', expect.any(Error), {
      sessionId: expect.any(String),
    });
  });
});

describe('the session route in a browser', () => {
  it('says sessions need the desktop app, and where to get it', async () => {
    await openApp('/studio/sessions/abc', { roles: ['educator'], studio: studio() });
    expect(
      await screen.findByRole('heading', { name: 'Sessions open in the Gurukul Studio app' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Get the desktop app' }).getAttribute('href')).toBe(
      DESKTOP_RELEASES_URL,
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
  it('shows the session: title, goal and the place of the workspace', async () => {
    const d = await desktopWith([{ kind: 'edit', courseId: 'git' }]);
    const session = d.made[0] as AuthoringSession;
    await d.store.close(session, 'saved');
    await openApp(`/studio/sessions/${session.id}`, { roles: ['educator'], studio: studio() });
    expect(await screen.findByRole('heading', { name: 'Simplify the basics.' })).toBeTruthy();
    expect(screen.getByText('Saved')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Goal' })).toBeTruthy();
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
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'A new course number 1.' })).toBeTruthy();
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
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'simplify' } });
    const option = await screen.findByRole('option', { name: /Simplify the basics/ });
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
        label: 'A new course number 1.',
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
