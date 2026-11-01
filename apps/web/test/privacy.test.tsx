import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AcceptPolicyPage } from '../src/privacy/AcceptPolicyPage';
import { PrivacyPage } from '../src/privacy/PrivacyPage';
import { POLICY_VERSION, acceptPolicy, hasAcceptedPolicy } from '../src/privacy/policy';
import { SignInPage } from '../src/auth/SignInPage';
import { AuthProvider } from '../src/auth/AuthProvider';
import { fakeAuth } from './fake-auth';
import { openApp } from './harness';

afterEach(() => vi.unstubAllGlobals());

describe('the policy record', () => {
  it('is accepted per version, per browser', () => {
    localStorage.clear();
    expect(hasAcceptedPolicy()).toBe(false);
    acceptPolicy();
    expect(hasAcceptedPolicy()).toBe(true);
    localStorage.setItem('gurukul.privacy.accepted', 'an older version');
    expect(hasAcceptedPolicy()).toBe(false);
  });
});

describe('the pages', () => {
  it('shows the policy with its version', () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Privacy policy' })).toBeTruthy();
    expect(screen.getByText(new RegExp(POLICY_VERSION))).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to Gurukul' })).toBeTruthy();
  });
  it('is reachable without signing in', async () => {
    await openApp('/privacy', { signedIn: false });
    expect(await screen.findByRole('heading', { name: 'Privacy policy' })).toBeTruthy();
  });
});

describe('signing in', () => {
  function renderSignIn() {
    const f = fakeAuth();
    render(
      <MemoryRouter>
        <AuthProvider service={f.service}>
          <SignInPage />
        </AuthProvider>
      </MemoryRouter>,
    );
    return f;
  }
  it('needs the policy accepted before the button works, then remembers it', async () => {
    localStorage.clear();
    const f = renderSignIn();
    const button = screen.getByRole('button', { name: /sign in with google/i });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('switch', { name: 'I accept the privacy policy' }));
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);
    await vi.waitFor(() => expect(f.service.signIn).toHaveBeenCalled());
    expect(hasAcceptedPolicy()).toBe(true);
    expect(screen.getByRole('link', { name: 'privacy policy' }).getAttribute('href')).toBe(
      '/privacy',
    );
  });
  it('does not ask again once accepted', () => {
    renderSignIn();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(
      (screen.getByRole('button', { name: /sign in with google/i }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});

describe('a signed-in person who has not accepted', () => {
  it('sees the policy gate instead of any page, and gets in by accepting', async () => {
    localStorage.clear();
    await openApp('/');
    expect(await screen.findByRole('heading', { name: 'Before you continue' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Accept and continue' }));
    await vi.waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Before you continue' })).toBeNull(),
    );
  });
  it('can sign out instead', async () => {
    localStorage.clear();
    const f = fakeAuth();
    render(
      <MemoryRouter>
        <AuthProvider service={f.service}>
          <AcceptPolicyPage />
        </AuthProvider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(f.service.signOut).toHaveBeenCalled();
  });
});
