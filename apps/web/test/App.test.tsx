import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { DESKTOP_SIGN_IN_MESSAGES, SignInProblem } from '../src/auth/service';
import { ROUTES, appRoutes } from '../src/routes';
import { groupByArea, titleFor } from '../src/Shell';
import { axeViolations } from './axe';
import { NONSTOP, fakeAuth } from './fake-auth';
import { fakeData } from './fake-data';
import { fakeConsole } from './fake-console';
import { fakeStudio } from './fake-studio';
import { fakeQuiz } from './fake-quiz';

async function open(path: string, claims: { educator?: boolean; admin?: boolean } = {}) {
  const f = fakeAuth(claims);
  const router = createMemoryRouter(appRoutes(), { initialEntries: [path] });
  const view = render(
    <App
      service={f.service}
      data={fakeData().data}
      quiz={fakeQuiz()}
      console={fakeConsole()}
      studio={fakeStudio()}
      router={router}
    />,
  );
  const roles = ['learner', ...Object.keys(claims)];
  await act(async () => {
    f.emitUser(NONSTOP);
    await Promise.resolve();
  });
  act(() => f.emitProfile({ roles, displayName: 'Priya N', team: null }));
  return { ...view, f, router };
}

describe('App gate', () => {
  it('shows a loading state, then the sign-in page when signed out', () => {
    const f = fakeAuth();
    render(
      <App
        service={f.service}
        data={fakeData().data}
        quiz={fakeQuiz()}
        console={fakeConsole()}
        studio={fakeStudio()}
        router={createMemoryRouter(appRoutes())}
      />,
    );
    expect(screen.getByText(/Loading Gurukul/)).toBeTruthy();
    act(() => f.emitUser(null));
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome to Gurukul.' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'gurukul@nonstopio.com' })).toBeNull();
    expect(screen.queryByRole('link', { name: "What's new" })).toBeNull();
    expect(screen.getByText(/Never stop learning, never stop teaching/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    expect(f.service.signIn).toHaveBeenCalled();
  });

  it('tells a personal account why it was refused, in an alert', () => {
    const f = fakeAuth();
    render(
      <App
        service={f.service}
        data={fakeData().data}
        quiz={fakeQuiz()}
        console={fakeConsole()}
        studio={fakeStudio()}
        router={createMemoryRouter(appRoutes())}
      />,
    );
    act(() => f.emitUser({ ...NONSTOP, email: 'priya@gmail.com' }));
    act(() => f.emitUser(null));
    const alert = screen
      .getAllByRole('alert')
      .find((a) => a.textContent.includes('priya@gmail.com')) as HTMLElement;
    expect(alert.textContent).toMatch(/@nonstopio.com/);
    // Choosing a personal account is the person's mix-up, not a Gurukul failure.
    expect(alert.querySelector('.g-mascot')?.getAttribute('data-expression')).toBe('confused');
    expect(document.activeElement).toBe(alert);
    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try another account' }));
    expect(f.service.signIn).toHaveBeenCalledWith({ chooseAccount: true });
  });

  it('shows the sad owl when sign-in itself fails', async () => {
    const f = fakeAuth();
    f.service.signIn = vi.fn().mockRejectedValue(new Error('popup closed'));
    render(
      <App
        service={f.service}
        data={fakeData().data}
        quiz={fakeQuiz()}
        console={fakeConsole()}
        studio={fakeStudio()}
        router={createMemoryRouter(appRoutes())}
      />,
    );
    act(() => f.emitUser(null));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    });
    const alert = screen
      .getAllByRole('alert')
      .find((a) => a.textContent.includes('Sign-in did not finish')) as HTMLElement;
    expect(alert.querySelector('.g-mascot')?.getAttribute('data-expression')).toBe('sad');
  });
});

describe('sign-in pending state', () => {
  function renderSignedOut(f: ReturnType<typeof fakeAuth>) {
    render(
      <App
        service={f.service}
        data={fakeData().data}
        quiz={fakeQuiz()}
        console={fakeConsole()}
        studio={fakeStudio()}
        router={createMemoryRouter(appRoutes())}
      />,
    );
  }

  it('keeps the label but marks the button busy and disabled until Google answers', async () => {
    const f = fakeAuth();
    let finish: () => void = () => {};
    f.service.signIn = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    renderSignedOut(f);
    act(() => f.emitUser(null));
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    const busy = screen.getByRole('button', { name: 'Sign in with Google' }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(busy.getAttribute('aria-busy')).toBe('true');
    await act(async () => finish());
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeTruthy();
  });

  it('does the same for "Try another account"', async () => {
    const f = fakeAuth();
    let finish: () => void = () => {};
    f.service.signIn = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    renderSignedOut(f);
    act(() => f.emitUser({ ...NONSTOP, email: 'priya@gmail.com' }));
    act(() => f.emitUser(null));
    fireEvent.click(screen.getByRole('button', { name: 'Try another account' }));
    expect(
      (screen.getByRole('button', { name: 'Try another account' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await act(async () => finish());
    expect(screen.getByRole('button', { name: 'Try another account' })).toBeTruthy();
  });

  it('in the desktop app, says to finish in the browser while it waits', async () => {
    (window as { gurukulDesktop?: unknown }).gurukulDesktop = { info: () => Promise.resolve() };
    try {
      const f = fakeAuth();
      let finish: () => void = () => {};
      f.service.signIn = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
      renderSignedOut(f);
      act(() => f.emitUser(null));
      expect(screen.queryByText(/opened in your browser/)).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
      expect(screen.getByText(/opened in your browser/).getAttribute('role')).toBe('status');
      await act(async () => finish());
      expect(screen.queryByText(/opened in your browser/)).toBeNull();
    } finally {
      delete (window as { gurukulDesktop?: unknown }).gurukulDesktop;
    }
  });

  it('in the desktop app, Sign in stays usable while it waits, and pressing it again starts over', async () => {
    (window as { gurukulDesktop?: unknown }).gurukulDesktop = { info: () => Promise.resolve() };
    try {
      const f = fakeAuth();
      const finishes: (() => void)[] = [];
      f.service.signIn = vi.fn(() => new Promise<void>((resolve) => finishes.push(resolve)));
      renderSignedOut(f);
      act(() => f.emitUser(null));
      const button = () => screen.getByRole('button', { name: 'Sign in with Google' });
      fireEvent.click(button());
      expect(button().hasAttribute('disabled')).toBe(false);
      fireEvent.click(button());
      expect(f.service.signIn).toHaveBeenCalledTimes(2);
      // The replaced attempt answers quietly; the hint stays for the one still waiting.
      await act(async () => finishes[0]?.());
      expect(screen.getByText(/opened in your browser/)).toBeTruthy();
      await act(async () => finishes[1]?.());
      expect(screen.queryByText(/opened in your browser/)).toBeNull();
    } finally {
      delete (window as { gurukulDesktop?: unknown }).gurukulDesktop;
    }
  });

  it('never shows the browser hint outside the desktop app', () => {
    const f = fakeAuth();
    f.service.signIn = vi.fn(() => new Promise<void>(() => undefined));
    renderSignedOut(f);
    act(() => f.emitUser(null));
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    expect(screen.queryByText(/opened in your browser/)).toBeNull();
  });

  it('shows a desktop sign-in problem in its own words, with the sad owl', async () => {
    const f = fakeAuth();
    f.service.signIn = vi
      .fn()
      .mockRejectedValue(
        new SignInProblem('not_configured', DESKTOP_SIGN_IN_MESSAGES.not_configured),
      );
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    renderSignedOut(f);
    act(() => f.emitUser(null));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    });
    const alert = screen
      .getAllByRole('alert')
      .find((a) => a.textContent.includes('built without Google sign-in')) as HTMLElement;
    expect(alert.querySelector('.g-mascot')?.getAttribute('data-expression')).toBe('sad');
  });
});

describe('signed-in shell', () => {
  it('lands on an empty Home and offers only what a Learner may open', async () => {
    await open('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Namaste, Priya' })).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Home' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(within(nav).queryByRole('link', { name: 'Changelog' })).toBeNull();
    expect(within(nav).queryByRole('link', { name: 'Overview' })).toBeNull();
    expect(document.title).toBe('NonStop Gurukul');
  });

  it('opens and closes the sidebar from the menu button, and closes it after navigating', async () => {
    await open('/');
    const menu = screen.getByRole('button', { name: 'Menu' });
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(menu);
    expect(menu.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById('app-sidebar')).toBeTruthy();
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', {
        name: 'Profile',
      }),
    );
    await waitFor(() => expect(menu.getAttribute('aria-expanded')).toBe('false'));
    fireEvent.click(menu);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(menu.getAttribute('aria-expanded')).toBe('false');
  });

  it('falls back to a friendly name without a display name', async () => {
    const f = fakeAuth();
    const router = createMemoryRouter(appRoutes(), { initialEntries: ['/'] });
    render(
      <App
        service={f.service}
        data={fakeData().data}
        quiz={fakeQuiz()}
        console={fakeConsole()}
        studio={fakeStudio()}
        router={router}
      />,
    );
    await act(async () => {
      f.emitUser({ ...NONSTOP, displayName: null });
      await Promise.resolve();
    });
    act(() => f.emitProfile({ roles: ['learner'], displayName: '', team: null }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Namaste' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /^Account: Priya priya@nonstopio\.com/ }),
    ).toBeTruthy();
  });

  it('shows an Admin the console and the studio in the sidebar', async () => {
    await open('/admin', { admin: true });
    await waitFor(() => screen.getByRole('link', { name: 'Overview' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Studio' })).toBeTruthy();
    expect(document.title).toBe('Overview · Gurukul');
  });

  it('lets an Educator into the studio but not the console link', async () => {
    await open('/studio', { educator: true });
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Courses' }));
    expect(screen.queryByRole('link', { name: 'Overview' })).toBeNull();
  });

  it('shows not-allowed, not a redirect, to a Learner at the console', async () => {
    await open('/admin');
    expect(screen.getByRole('heading', { name: /do not have access/ })).toBeTruthy();
  });

  it('shows the changelog and a not-found page', async () => {
    const { unmount } = await open('/changelog');
    expect(await screen.findByRole('heading', { level: 1, name: 'Changelog' })).toBeTruthy();
    expect(document.title).toBe('Changelog · Gurukul');
    unmount();
    await open('/nowhere');
    expect(
      screen.getByRole('heading', { level: 1, name: 'This page does not exist.' }),
    ).toBeTruthy();
    expect(document.querySelector('.g-empty .g-mascot')?.getAttribute('data-expression')).toBe(
      'curious',
    );
  });

  it('searches and navigates in-app', async () => {
    const { router } = await open('/');
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'changelog' } });
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    await waitFor(() => expect(router.state.location.pathname).toBe('/changelog'));
  });

  it('signs out from the account menu at the foot of the sidebar', async () => {
    const { f } = await open('/');
    fireEvent.click(screen.getByRole('button', { name: /^Account: / }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(f.service.signOut).toHaveBeenCalled();
  });
});

describe('offline banner', () => {
  it('shows while the connection is gone and leaves when it returns', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await open('/');
    const text = "You're offline. Progress will sync when you're back.";
    const banner = await screen.findByText(text);
    expect(banner.getAttribute('role')).toBe('status');
    const owl = banner.querySelector('.g-mascot');
    expect(owl?.getAttribute('data-expression')).toBe('worried');
    expect(owl?.getAttribute('aria-hidden')).toBe('true');
    online.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByText(text)).toBeNull();
    online.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByText(text)).toBeTruthy();
    online.mockRestore();
  });

  it('is not shown online', async () => {
    await open('/');
    await screen.findByRole('heading', { level: 1, name: 'Namaste, Priya' });
    expect(screen.queryByText(/You're offline/)).toBeNull();
  });
});

describe('titleFor and groupByArea', () => {
  it('names a page from its navigation label', () => {
    expect(titleFor('/changelog/')).toBe('Changelog · Gurukul');
    expect(titleFor('/')).toBe('NonStop Gurukul');
    expect(titleFor('/nowhere')).toBe('NonStop Gurukul');
  });

  it('groups destinations by area, keeping order', () => {
    const d = (id: string, areaName: string) => ({
      id,
      areaName,
      path: `/${id}`,
      label: id,
      description: '',
      keywords: [],
    });
    expect(
      groupByArea([d('a', 'X'), d('b', 'Y'), d('c', 'X')]).map(([n, p]) => [n, p.length]),
    ).toEqual([
      ['X', 2],
      ['Y', 1],
    ]);
  });
});

describe('accessibility', () => {
  it.each(['/', '/changelog', '/nowhere'])('%s has no axe violations', async (path) => {
    const { container } = await open(path);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('has none on the sign-in page', async () => {
    const f = fakeAuth();
    const { container } = render(
      <App
        service={f.service}
        data={fakeData().data}
        quiz={fakeQuiz()}
        console={fakeConsole()}
        studio={fakeStudio()}
        router={createMemoryRouter(appRoutes())}
      />,
    );
    act(() => f.emitUser(null));
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('first download', () => {
  it('loads the course page on demand, so its Markdown parser is not in the entry chunk', () => {
    const page = ROUTES['/courses/:courseId'].type as unknown as { $$typeof: symbol };
    expect(page.$$typeof).toBe(Symbol.for('react.lazy'));
  });
});
