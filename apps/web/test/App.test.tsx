import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { appRoutes } from '../src/routes';
import { groupByArea, titleFor } from '../src/Shell';
import { axeViolations } from './axe';
import { NONSTOP, fakeAuth } from './fake-auth';
import { fakeData } from './fake-data';
import { fakeConsole } from './fake-console';
import { fakeStudio } from './fake-studio';
import { fakePariksha } from './fake-pariksha';

async function open(path: string, claims: { acharya?: boolean; kulapati?: boolean } = {}) {
  const f = fakeAuth(claims);
  const router = createMemoryRouter(appRoutes(), { initialEntries: [path] });
  const view = render(
    <App
      service={f.service}
      data={fakeData().data}
      pariksha={fakePariksha()}
      console={fakeConsole()}
      studio={fakeStudio()}
      router={router}
    />,
  );
  const roles = ['shishya', ...Object.keys(claims)];
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
        pariksha={fakePariksha()}
        console={fakeConsole()}
        studio={fakeStudio()}
        router={createMemoryRouter(appRoutes())}
      />,
    );
    expect(screen.getByText(/Loading Gurukul/)).toBeTruthy();
    act(() => f.emitUser(null));
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome to Gurukul.' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    expect(f.service.signIn).toHaveBeenCalled();
  });

  it('tells a personal account why it was refused, in an alert', () => {
    const f = fakeAuth();
    render(
      <App
        service={f.service}
        data={fakeData().data}
        pariksha={fakePariksha()}
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

describe('signed-in shell', () => {
  it('lands on an empty Home and offers only what a Shishya may open', async () => {
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

  it('falls back to a friendly name without a display name', async () => {
    const f = fakeAuth();
    const router = createMemoryRouter(appRoutes(), { initialEntries: ['/'] });
    render(
      <App
        service={f.service}
        data={fakeData().data}
        pariksha={fakePariksha()}
        console={fakeConsole()}
        studio={fakeStudio()}
        router={router}
      />,
    );
    await act(async () => {
      f.emitUser({ ...NONSTOP, displayName: null });
      await Promise.resolve();
    });
    act(() => f.emitProfile({ roles: ['shishya'], displayName: '', team: null }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Namaste' })).toBeTruthy();
    expect(screen.getByText('priya@nonstopio.com')).toBeTruthy();
  });

  it('shows a Kulapati the console and the studio in the sidebar', async () => {
    await open('/kulapati', { kulapati: true });
    await waitFor(() => screen.getByRole('link', { name: 'Overview' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Studio' })).toBeTruthy();
    expect(document.title).toBe('Overview · Gurukul');
  });

  it('lets an Acharya into the studio but not the console link', async () => {
    await open('/studio', { acharya: true });
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Courses' }));
    expect(screen.queryByRole('link', { name: 'Overview' })).toBeNull();
  });

  it('shows not-allowed, not a redirect, to a Shishya at the console', async () => {
    await open('/kulapati');
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
        pariksha={fakePariksha()}
        console={fakeConsole()}
        studio={fakeStudio()}
        router={createMemoryRouter(appRoutes())}
      />,
    );
    act(() => f.emitUser(null));
    expect(await axeViolations(container)).toEqual([]);
  });
});
