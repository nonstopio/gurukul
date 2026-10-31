import { act, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeStudio } from './fake-studio';
import { openApp } from './harness';

type Listener = () => void;

/** A `matchMedia` whose answer the test can flip; returns the flip. */
function viewport(matches: boolean) {
  let now = matches;
  const listeners = new Set<Listener>();
  window.matchMedia = vi.fn(() => ({
    get matches() {
      return now;
    },
    addEventListener: (_: string, l: Listener) => listeners.add(l),
    removeEventListener: (_: string, l: Listener) => listeners.delete(l),
  })) as unknown as typeof window.matchMedia;
  return (to: boolean) => {
    now = to;
    listeners.forEach((l) => l());
  };
}

const original = window.matchMedia;
afterEach(() => {
  window.matchMedia = original;
});

describe('Studio on a small screen', () => {
  it('says it needs a bigger canvas instead of showing the editor', async () => {
    viewport(false);
    await openApp('/studio', { roles: ['educator'], studio: fakeStudio() });
    expect(
      await screen.findByRole('heading', { level: 1, name: /needs a bigger canvas/ }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to Home' })).toBeTruthy();
  });

  it('opens the page when the window grows to desktop width', async () => {
    const resize = viewport(false);
    await openApp('/studio', { roles: ['educator'], studio: fakeStudio() });
    await screen.findByRole('heading', { level: 1, name: /needs a bigger canvas/ });
    act(() => resize(true));
    expect(screen.queryByRole('heading', { name: /needs a bigger canvas/ })).toBeNull();
  });

  it('shows the page where the browser cannot tell the width', async () => {
    window.matchMedia = undefined as unknown as typeof window.matchMedia;
    await openApp('/studio', { roles: ['educator'], studio: fakeStudio() });
    expect(await screen.findByRole('heading', { level: 1 })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /needs a bigger canvas/ })).toBeNull();
  });
});
