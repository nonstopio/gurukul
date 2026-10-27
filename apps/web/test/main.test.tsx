import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/data/firebase', () => ({ firebaseLearnerData: vi.fn(() => ({})) }));
vi.mock('../src/firebase', () => ({ initFirebase: vi.fn(() => ({ auth: {}, db: {} })) }));
vi.mock('../src/auth/service', () => ({
  firebaseAuthService: vi.fn(() => ({
    onUser: (cb: (u: null) => void) => {
      cb(null);
      return () => {};
    },
    signIn: vi.fn(),
    signOut: vi.fn(),
    claims: vi.fn(),
    watchProfile: vi.fn(),
  })),
}));

describe('main', () => {
  it('mounts the app into #root on load, showing sign-in to a signed-out visitor', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    await act(async () => {
      await import('../src/main');
    });
    expect(document.querySelector('#root h1')?.textContent).toBe('Welcome to Gurukul.');
  });

  it('fails loudly when #root is missing', async () => {
    const { mount } = await import('../src/main');
    expect(() => mount(null)).toThrow('#root element is missing');
  });
});
