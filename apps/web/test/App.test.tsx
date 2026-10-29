import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { appRoutes } from '../src/routes';
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
    expect(screen.getByRole('link', { name: 'gurukul@nonstopio.com' }).getAttribute('href')).toBe(
      'mailto:gurukul@nonstopio.com',
    );
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
    const alert = screen.getByText(/priya@gmail.com/);
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent).toMatch(/@nonstopio.com/);
    expect(document.activeElement).toBe(alert);
    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try another account' }));
    expect(f.service.signIn).toHaveBeenCalledWith({ chooseAccount: true });
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

  it('disables the button and says "Signing in…" until Google answers', async () => {
    const f = fakeAuth();
    let finish: () => void = () => {};
    f.service.signIn = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    renderSignedOut(f);
    act(() => f.emitUser(null));
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    const busy = screen.getByRole('button', { name: 'Signing in…' }) as HTMLButtonElement;
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
      (screen.getByRole('button', { name: 'Signing in…' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await act(async () => finish());
    expect(screen.getByRole('button', { name: 'Try another account' })).toBeTruthy();
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
    expect(within(nav).getByRole('link', { name: 'Changelog' })).toBeTruthy();
    expect(within(nav).queryByRole('link', { name: 'Overview' })).toBeNull();
    expect(document.title).toBe('Gurukul · NonStop Academy');
  });

  it('opens and closes the sidebar from the menu button, and closes it after navigating', async () => {
    await open('/');
    const menu = screen.getByRole('button', { name: 'Menu' });
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(menu);
    expect(menu.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById('app-sidebar')?.className).toContain('app__sidebar--open');
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', {
        name: 'Changelog',
      }),
    );
    await waitFor(() => expect(menu.getAttribute('aria-expanded')).toBe('false'));
    fireEvent.click(menu);
    fireEvent.click(menu);
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
    expect(screen.getByText('priya@nonstopio.com')).toBeTruthy();
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
  });

  it('searches and navigates in-app', async () => {
    const { router } = await open('/');
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'changelog' } });
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    await waitFor(() => expect(router.state.location.pathname).toBe('/changelog'));
  });

  it('signs out from the sidebar', async () => {
    const { f } = await open('/');
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(f.service.signOut).toHaveBeenCalled();
  });
});

describe('offline banner', () => {
  it('shows while the connection is gone and leaves when it returns', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await open('/');
    const text = "You're offline. Progress will sync when you're back.";
    expect((await screen.findByText(text)).getAttribute('role')).toBe('status');
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
    expect(titleFor('/')).toBe('Gurukul · NonStop Academy');
    expect(titleFor('/nowhere')).toBe('Gurukul · NonStop Academy');
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
