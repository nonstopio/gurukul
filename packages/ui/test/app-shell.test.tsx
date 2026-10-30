import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../src/AppShell';
import { NavItem, Sidebar } from '../src';
import { axeViolations } from './axe';

function Shell({ navKey, sidebarId }: { navKey?: string; sidebarId?: string }) {
  return (
    <AppShell
      navKey={navKey}
      sidebarId={sidebarId}
      bar={<button type="button">Search</button>}
      sidebar={
        <Sidebar label="Main" brand="Gurukul" footer={<button type="button">Sign out</button>}>
          <NavItem href="/">Home</NavItem>
          <NavItem href="/courses">Courses</NavItem>
        </Sidebar>
      }
    >
      <main id="content">
        <h1>Home</h1>
      </main>
    </AppShell>
  );
}

const menu = () => screen.getByRole('button', { name: 'Menu' });
const content = () => document.querySelector('.g-app-shell__content') as HTMLElement;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AppShell', () => {
  it('renders the sidebar, the bar and the content, closed, with no axe violations', async () => {
    const { container } = render(<Shell />);
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy();
    expect(screen.getByRole('main').id).toBe('content');
    expect(screen.getByRole('button', { name: 'Search' })).toBeTruthy();
    expect(menu().getAttribute('aria-expanded')).toBe('false');
    expect(menu().getAttribute('aria-controls')).toBe('app-sidebar');
    expect(document.getElementById('app-sidebar')?.contains(screen.getByRole('navigation'))).toBe(
      true,
    );
    expect(content().hasAttribute('inert')).toBe(false);
    expect(container.querySelector('.g-app-shell__scrim')).toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('opens: focus moves into the sidebar, the content goes inert, a scrim appears', async () => {
    const { container } = render(<Shell sidebarId="side" />);
    fireEvent.click(menu());
    expect(menu().getAttribute('aria-expanded')).toBe('true');
    expect(menu().getAttribute('aria-controls')).toBe('side');
    expect(container.firstElementChild?.className).toBe('g-app-shell g-app-shell--open');
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Home' }));
    expect(content().hasAttribute('inert')).toBe(true);
    expect(container.querySelector('.g-app-shell__scrim')).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
    fireEvent.click(menu());
    expect(menu().getAttribute('aria-expanded')).toBe('false');
  });

  it('opens with nothing focusable in the sidebar without throwing', () => {
    render(
      <AppShell sidebar={<p>Empty</p>} menuLabel="Navigation">
        <main />
      </AppShell>,
    );
    const button = screen.getByRole('button', { name: 'Navigation' });
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Close navigation', hidden: true })).toBeTruthy();
  });

  it('closes on Escape and returns focus to the Menu button; other keys do nothing', () => {
    render(<Shell />);
    fireEvent.click(menu());
    fireEvent.keyDown(document, { key: 'a' });
    expect(menu().getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(menu().getAttribute('aria-expanded')).toBe('false');
    expect(content().hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(menu());
  });

  it('closes on a scrim click and returns focus to the Menu button', () => {
    const { container } = render(<Shell />);
    fireEvent.click(menu());
    fireEvent.click(container.querySelector('.g-app-shell__scrim') as HTMLElement);
    expect(menu().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(menu());
  });

  it('closes when navKey changes, leaving focus to the new page', () => {
    const { rerender } = render(<Shell navKey="/" />);
    fireEvent.click(menu());
    const link = screen.getByRole('link', { name: 'Home' });
    rerender(<Shell navKey="/courses" />);
    expect(menu().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(link);
  });

  it('closes when the window widens to the desktop layout, and stops listening when closed', () => {
    const listeners = new Set<(e: { matches: boolean }) => void>();
    const mq = {
      addEventListener: vi.fn((_: string, fn: (e: { matches: boolean }) => void) =>
        listeners.add(fn),
      ),
      removeEventListener: vi.fn((_: string, fn: (e: { matches: boolean }) => void) =>
        listeners.delete(fn),
      ),
    };
    const matchMedia = vi.fn(() => mq);
    vi.stubGlobal('matchMedia', matchMedia);
    render(<Shell />);
    fireEvent.click(menu());
    expect(matchMedia).toHaveBeenCalledWith('(min-width: 64rem)');
    act(() => listeners.forEach((fn) => fn({ matches: false })));
    expect(menu().getAttribute('aria-expanded')).toBe('true');
    act(() => listeners.forEach((fn) => fn({ matches: true })));
    expect(menu().getAttribute('aria-expanded')).toBe('false');
    expect(listeners.size).toBe(0);
  });
});
