import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../src/auth/AuthProvider';
import { RequireSession, SETUP_SLOW_MS } from '../src/auth/RequireSession';
import { BOOT_LOADER_ID } from '../src/boot';
import { NONSTOP, fakeAuth } from './fake-auth';

const STUCK = 'Still setting up your account';

function setup() {
  const f = fakeAuth();
  const view = render(
    <MemoryRouter>
      <AuthProvider service={f.service}>
        <Routes>
          <Route element={<RequireSession />}>
            <Route index element={<p>home</p>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
  return { ...view, f };
}

/** Signed in to Google, and the profile watch has reported that `users/{uid}` does not exist. */
async function signedInWithoutProfile() {
  const s = setup();
  await act(async () => {
    s.f.emitUser(NONSTOP);
    await Promise.resolve();
  });
  act(() => s.f.emitProfile(null));
  return s;
}

const profile = { roles: ['learner' as const], displayName: 'Priya N', team: null };

describe('RequireSession without a profile document', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.getElementById(BOOT_LOADER_ID)?.remove();
  });

  it('keeps the loader for a moment: the first sign-in waits a little for the profile', async () => {
    await signedInWithoutProfile();
    act(() => vi.advanceTimersByTime(SETUP_SLOW_MS - 1));
    expect(screen.getByText(/Loading Gurukul/)).toBeTruthy();
    expect(screen.queryByText(STUCK)).toBeNull();
  });

  it('says so with Retry and Sign out after a while, and hides the boot loader over it', async () => {
    const boot = document.createElement('div');
    boot.id = BOOT_LOADER_ID;
    document.body.append(boot);
    await signedInWithoutProfile();
    act(() => vi.advanceTimersByTime(SETUP_SLOW_MS));
    expect(screen.getByRole('status').textContent).toContain(STUCK);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(boot.dataset.leaving).toBe('true');
  });

  it('lets the person in with no click when the profile arrives late', async () => {
    const { f } = await signedInWithoutProfile();
    act(() => vi.advanceTimersByTime(SETUP_SLOW_MS));
    expect(screen.getByText(STUCK)).toBeTruthy();
    act(() => f.emitProfile(profile));
    expect(screen.queryByText(STUCK)).toBeNull();
    expect(f.service.watchProfile).toHaveBeenCalledTimes(1);
  });

  it('never shows the message when the profile arrives in time', async () => {
    const { f } = await signedInWithoutProfile();
    act(() => f.emitProfile(profile));
    act(() => vi.advanceTimersByTime(SETUP_SLOW_MS));
    expect(screen.queryByText(STUCK)).toBeNull();
    expect(screen.queryByText(/Loading Gurukul/)).toBeNull();
  });

  it('does not start the clock before Google says who is signed in', () => {
    setup();
    act(() => vi.advanceTimersByTime(SETUP_SLOW_MS));
    expect(screen.queryByText(STUCK)).toBeNull();
  });

  it('signs out from the message', async () => {
    const { f } = await signedInWithoutProfile();
    act(() => vi.advanceTimersByTime(SETUP_SLOW_MS));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(f.service.signOut).toHaveBeenCalled();
  });

  it('reloads the page on Retry', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    try {
      await signedInWithoutProfile();
      act(() => vi.advanceTimersByTime(SETUP_SLOW_MS));
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(reload).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('clears the clock when it unmounts', async () => {
    const { unmount } = await signedInWithoutProfile();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
