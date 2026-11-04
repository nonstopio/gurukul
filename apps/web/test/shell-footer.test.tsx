import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadContributors } from '../src/contributors';
import type { Contributor } from '../src/contributors';
import { CALLOUTS, CALLOUT_MS, ShellFooter } from '../src/ShellFooter';
import { axeViolations } from './axe';

const people = (n: number): Contributor[] =>
  Array.from({ length: n }, (_, i) => ({
    login: `dev${i}`,
    avatarUrl: `https://avatars.githubusercontent.com/u/${i}`,
    profileUrl: `https://github.com/dev${i}`,
  }));

async function show() {
  const view = render(
    <MemoryRouter>
      <ShellFooter />
    </MemoryRouter>,
  );
  await act(async () => {
    await Promise.resolve();
  });
  return view;
}

const callout = (text: string) => screen.getByRole('link', { name: text });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.mocked(loadContributors).mockReset().mockResolvedValue([]);
});

describe('ShellFooter', () => {
  it("links What's new in the app and the repository on GitHub, with no axe violations", async () => {
    vi.useRealTimers();
    const { container } = await show();
    expect(screen.getByRole('link', { name: "What's new" }).getAttribute('href')).toBe(
      '/changelog',
    );
    const github = screen.getByRole('link', { name: 'GitHub' });
    expect(github.getAttribute('href')).toBe('https://github.com/nonstopio/gurukul');
    expect(github.getAttribute('target')).toBe('_blank');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('shows no "Built by" when the contributor list is empty (failed or rate-limited)', async () => {
    await show();
    expect(screen.queryByText('Built by')).toBeNull();
  });

  it('shows up to eight contributors, each linking to their GitHub profile', async () => {
    vi.mocked(loadContributors).mockResolvedValue(people(10));
    const { container } = await show();
    const list = screen.getByRole('list', { name: 'Built by' });
    const links = within(list).getAllByRole('link');
    expect(links).toHaveLength(8);
    expect(links[0]?.getAttribute('aria-label')).toBe('dev0 on GitHub');
    expect(links[0]?.getAttribute('title')).toBe('dev0');
    expect(links[0]?.getAttribute('href')).toBe('https://github.com/dev0');
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://avatars.githubusercontent.com/u/0',
    );
  });

  it('ignores a list that arrives after it is gone', async () => {
    let answer: (list: Contributor[]) => void = () => undefined;
    vi.mocked(loadContributors).mockReturnValue(new Promise((r) => (answer = r)));
    const view = render(
      <MemoryRouter>
        <ShellFooter />
      </MemoryRouter>,
    );
    view.unmount();
    await act(async () => {
      answer(people(1));
      await Promise.resolve();
    });
    expect(screen.queryByText('Built by')).toBeNull();
  });

  it('turns the open-source line every 9 s, and holds it while pointed at or focused', async () => {
    await show();
    const [a, b, c] = CALLOUTS.map((x) => x.text) as [string, string, string];
    expect(callout(a).getAttribute('href')).toBe('https://github.com/nonstopio/gurukul/issues');
    act(() => vi.advanceTimersByTime(CALLOUT_MS));
    expect(callout(b)).toBeTruthy();
    fireEvent.mouseEnter(callout(b));
    act(() => vi.advanceTimersByTime(CALLOUT_MS * 2));
    expect(callout(b)).toBeTruthy();
    fireEvent.mouseLeave(callout(b));
    fireEvent.focus(callout(b));
    act(() => vi.advanceTimersByTime(CALLOUT_MS));
    expect(callout(b)).toBeTruthy();
    fireEvent.blur(callout(b));
    act(() => vi.advanceTimersByTime(CALLOUT_MS));
    expect(callout(c)).toBeTruthy();
    act(() => vi.advanceTimersByTime(CALLOUT_MS));
    expect(callout(a)).toBeTruthy();
  });

  it('keeps the first line still under reduced motion', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((q: string) => ({ matches: q === '(prefers-reduced-motion: reduce)' })),
    );
    await show();
    act(() => vi.advanceTimersByTime(CALLOUT_MS * 3));
    expect(callout(CALLOUTS[0]?.text as string)).toBeTruthy();
  });
});
