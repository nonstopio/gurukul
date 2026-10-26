import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GlobalSearchProvider, SearchTrigger, isMac } from '../src/navigation/GlobalSearch';
import type { AreaNavigation } from '../src/navigation/types';

const areas: AreaNavigation[] = [
  {
    slug: 'platform',
    name: 'Gurukul',
    pages: [
      { id: 'home', path: '/', label: 'Home' },
      { id: 'changelog', path: '/changelog', label: 'Changelog', description: 'Every change' },
      { id: 'secret', path: '/kulapati', label: 'Kulapati console', roles: ['kulapati'] },
    ],
  },
];

function setup(props: { mac?: boolean } = {}) {
  const navigate = vi.fn();
  render(
    <GlobalSearchProvider navigate={navigate} areas={areas} mac={props.mac ?? false}>
      <SearchTrigger />
    </GlobalSearchProvider>,
  );
  return { navigate };
}
const key = (init: KeyboardEventInit) =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, ...init }));
  });
const dialog = () => screen.queryByRole('dialog', { name: 'Search Gurukul' });

describe('GlobalSearchProvider', () => {
  it('opens from the trigger and lists only pages this person can open', () => {
    setup();
    const trigger = screen.getByRole('button', { name: /Search/ });
    expect(trigger.getAttribute('aria-keyshortcuts')).toBe('Control+K');
    expect(trigger.textContent).toContain('Ctrl K');
    fireEvent.click(trigger);
    expect(dialog()).toBeTruthy();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['HomeGurukulPage', 'ChangelogGurukul · Every changePage']);
  });

  it('navigates to the chosen page and closes', () => {
    const { navigate } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'change' } });
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(navigate).toHaveBeenCalledWith('/changelog');
    expect(dialog()).toBeNull();
  });

  it('toggles with Ctrl+K (or the K key on any layout) and ignores other chords', () => {
    setup();
    key({ key: 'k', ctrlKey: true });
    expect(dialog()).toBeTruthy();
    key({ key: 'л', code: 'KeyK', ctrlKey: true });
    expect(dialog()).toBeNull();
    key({ key: 'k' });
    key({ key: 'k', ctrlKey: true, shiftKey: true });
    key({ key: 'k', ctrlKey: true, altKey: true });
    key({ key: 'j', ctrlKey: true });
    key({ key: 'k', metaKey: true });
    expect(dialog()).toBeNull();
  });

  it('survives a keydown with no key, as browser autofill sends', () => {
    setup();
    act(() => {
      window.dispatchEvent(new Event('keydown'));
    });
    expect(dialog()).toBeNull();
  });

  it('uses Cmd+K on a Mac', () => {
    setup({ mac: true });
    expect(screen.getByRole('button', { name: /Search/ }).getAttribute('aria-keyshortcuts')).toBe(
      'Meta+K',
    );
    key({ key: 'k', ctrlKey: true });
    expect(dialog()).toBeNull();
    key({ key: 'K', metaKey: true });
    expect(dialog()).toBeTruthy();
  });

  it('closes on Escape', () => {
    setup();
    key({ key: 'k', ctrlKey: true });
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    expect(dialog()).toBeNull();
  });

  it('uses the real areas and the Shishya role by default', () => {
    render(
      <GlobalSearchProvider navigate={vi.fn()}>
        <SearchTrigger />
      </GlobalSearchProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
  });
});

describe('SearchTrigger', () => {
  it('renders nothing outside the provider', () => {
    const { container } = render(<SearchTrigger />);
    expect(container.innerHTML).toBe('');
  });
});

describe('isMac', () => {
  it('reads the platform, falling back to the user agent', () => {
    expect(isMac({ platform: 'MacIntel', userAgent: '' })).toBe(true);
    expect(isMac({ platform: '', userAgent: 'Mozilla (iPhone)' })).toBe(true);
    expect(isMac({ platform: 'Win32', userAgent: 'Windows' })).toBe(false);
    expect(typeof isMac()).toBe('boolean');
  });
});
