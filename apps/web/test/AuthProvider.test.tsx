import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import {
  AuthProvider,
  RETRY_MESSAGE,
  deniedMessage,
  useSession,
  useUser,
} from '../src/auth/AuthProvider';
import { RequireRole } from '../src/auth/RequireRole';
import { NONSTOP, fakeAuth } from './fake-auth';

function Probe() {
  const s = useSession();
  return (
    <div>
      <p data-testid="out">{`${s.status}|${s.roles.join(',')}|${s.error ?? ''}`}</p>
      <p data-testid="wrong">{String(s.wrongAccount)}</p>
      <button onClick={() => void s.signIn()}>in</button>
      <button onClick={() => void s.signIn({ chooseAccount: true })}>other</button>
      <button onClick={() => void s.signOut()}>out</button>
    </div>
  );
}
const out = () => screen.getByTestId('out').textContent;
const setup = (claims = {}) => {
  const f = fakeAuth(claims);
  // The not-allowed page links home with a router Link, so it needs a router around it.
  render(
    <MemoryRouter>
      <AuthProvider service={f.service}>
        <Probe />
        <RequireRole any={['admin']}>
          <p>console</p>
        </RequireRole>
      </AuthProvider>
    </MemoryRouter>,
  );
  return f;
};

describe('AuthProvider', () => {
  it('starts loading, then signedOut with no user', () => {
    const f = setup();
    expect(out()).toBe('loading|learner|');
    act(() => f.emitUser(null));
    expect(out()).toBe('signedOut|learner|');
    expect(screen.queryByText('console')).toBeNull();
  });

  it('is ready only once the profile exists', async () => {
    const f = setup();
    act(() => f.emitUser(NONSTOP));
    expect(out()?.startsWith('loading')).toBe(true);
    act(() => f.emitProfile(null));
    expect(out()?.startsWith('loading')).toBe(true);
    await waitFor(() => expect(f.service.claims).toHaveBeenCalled());
    act(() => f.emitProfile({ roles: ['learner'], displayName: 'P', team: null }));
    expect(out()).toBe('ready|learner|');
    expect(f.service.claims).toHaveBeenCalledTimes(1);
  });

  it('shows progress, not the sign-in page, between Google sign-in and the profile', () => {
    const f = setup();
    act(() => f.emitUser(null));
    act(() => f.emitUser(NONSTOP));
    expect(out()).toBe('loading|learner|');
  });

  it('asks to sign in again when the profile watch fails, instead of hanging', () => {
    const f = setup();
    act(() => f.emitUser(null));
    act(() => f.emitUser(NONSTOP));
    act(() => f.failProfile(Object.assign(new Error('denied'), { code: 'permission-denied' })));
    expect(out()).toBe(`signedOut|learner|${RETRY_MESSAGE}`);
    expect(f.service.signOut).toHaveBeenCalled();
    act(() => f.emitUser(null));
    expect(out()).toBe(`signedOut|learner|${RETRY_MESSAGE}`);
  });

  it('takes roles from claims and lets an Admin into the console', async () => {
    const f = setup({ admin: true });
    act(() => f.emitUser(NONSTOP));
    act(() => f.emitProfile({ roles: ['learner', 'admin'], displayName: 'P', team: null }));
    await waitFor(() => expect(out()).toBe('ready|learner,admin|'));
    expect(screen.getByText('console')).toBeTruthy();
  });

  it('refreshes the token once when the profile mirror disagrees with the claims', async () => {
    const f = setup({});
    act(() => f.emitUser(NONSTOP));
    await waitFor(() => expect(f.service.claims).toHaveBeenCalledTimes(1));
    act(() => f.emitProfile({ roles: ['learner', 'educator'], displayName: 'P', team: null }));
    await waitFor(() => expect(f.service.claims).toHaveBeenCalledWith(NONSTOP, true));
  });

  it('shows the not-allowed page to someone without the role', async () => {
    const f = setup();
    act(() => f.emitUser(NONSTOP));
    act(() => f.emitProfile({ roles: ['learner'], displayName: 'P', team: null }));
    expect(screen.getByRole('heading', { name: /do not have access/ })).toBeTruthy();
  });

  it.each([
    { ...NONSTOP, email: 'priya@gmail.com' },
    { ...NONSTOP, emailVerified: false },
    { ...NONSTOP, email: null },
  ])('signs %j straight back out with a message', (user) => {
    const f = setup();
    act(() => f.emitUser(user));
    expect(out()).toBe(`denied|learner|${deniedMessage(user.email)}`);
    expect(screen.getByTestId('wrong').textContent).toBe('true');
    expect(f.service.signOut).toHaveBeenCalled();
    expect(f.service.watchProfile).not.toHaveBeenCalled();
  });

  it('names the refused address, and says only the hint when there is none', () => {
    expect(deniedMessage('priya@gmail.com')).toMatch(/^You signed in as priya@gmail.com\. /);
    expect(deniedMessage(null)).toMatch(/^Gurukul is for NonStop io accounts/);
  });

  it('passes the account-picker choice through and clears the refusal on a good account', async () => {
    const f = setup();
    act(() => f.emitUser({ ...NONSTOP, email: 'priya@gmail.com' }));
    await act(async () => screen.getByText('other').click());
    expect(f.service.signIn).toHaveBeenCalledWith({ chooseAccount: true });
    act(() => f.emitUser(NONSTOP));
    expect(screen.getByTestId('wrong').textContent).toBe('false');
  });

  it('finishes a redirect sign-in on load, and reports one that failed', async () => {
    const f = fakeAuth();
    f.service.finishRedirect = vi.fn().mockRejectedValue(new Error('auth/network-request-failed'));
    render(
      <AuthProvider service={f.service}>
        <Probe />
      </AuthProvider>,
    );
    act(() => f.emitUser(null));
    await waitFor(() => expect(out()).toBe(`signedOut|learner|${RETRY_MESSAGE}`));
  });

  it('signs out through the service and drops the profile watch on sign-out', async () => {
    const f = setup();
    act(() => f.emitUser(NONSTOP));
    act(() => f.emitUser(null));
    expect(out()).toBe('signedOut|learner|');
    screen.getByText('out').click();
    expect(f.service.signOut).toHaveBeenCalled();
  });

  it('reports a failed or cancelled sign-in, and clears it on the next try', async () => {
    const f = setup();
    f.service.signIn = (() => Promise.reject(new Error('popup closed'))) as never;
    act(() => f.emitUser(null));
    await act(async () => screen.getByText('in').click());
    expect(out()).toBe(`signedOut|learner|${RETRY_MESSAGE}`);
    f.service.signIn = (() => Promise.resolve()) as never;
    await act(async () => screen.getByText('in').click());
    expect(out()).toBe('signedOut|learner|');
  });

  it('useUser throws unless somebody is signed in', () => {
    function NeedsUser() {
      useUser();
      return null;
    }
    const f = fakeAuth();
    const spy = console.error;
    console.error = () => {};
    expect(() =>
      render(
        <AuthProvider service={f.service}>
          <NeedsUser />
        </AuthProvider>,
      ),
    ).toThrow(/needs a signed-in user/);
    console.error = spy;
  });

  it('throws a clear error outside the provider', () => {
    const spy = console.error;
    console.error = () => {};
    expect(() => render(<Probe />)).toThrow(/inside <AuthProvider>/);
    console.error = spy;
  });
});
