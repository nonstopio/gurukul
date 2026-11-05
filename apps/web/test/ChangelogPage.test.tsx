import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChangelogPage, formatDay } from '../src/changelog/ChangelogPage';
import { CHANGES, type Change } from '../src/changelog';
import { axeViolations } from './axe';
import { choose, optionNames } from './select';

const changes: Change[] = [
  {
    file: '2026-10-27-120000-c.ts',
    release: null,
    date: '2026-10-27',
    id: 'GH-3',
    title: 'Quizzes can be retaken',
    area: 'QUIZ',
    kind: 'feature',
    why: 'People who failed once had no way back in',
    detail: 'Prose detail about cooldowns',
    deploy: 'Deploy the functions first',
  },
  {
    file: '2026-10-26-120000-b.ts',
    release: 'release-2',
    date: '2026-10-26',
    id: 'GH-2',
    title: 'Lesson player remembers your place',
    area: 'LEARN',
    kind: 'fix',
    why: 'Resume opened the first lesson every time',
    detail: ['Resume opens the last lesson you opened'],
    notes: ['Background on why'],
  },
  {
    file: '2026-10-25-120000-a.ts',
    release: 'release-2',
    date: '2026-10-25',
    id: 'GH-1',
    title: 'Empty detail renders nothing',
    area: 'LEARN',
    kind: 'docs',
    why: 'Because',
    detail: [],
    notes: [],
  },
];

describe('ChangelogPage', () => {
  it('groups unreleased first, then releases, with counts', () => {
    render(<ChangelogPage changes={changes} releases={['release-2']} />);
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      'Unreleased — merged, not yet in a release · 1 change',
      'release-2 · 2 changes',
    ]);
    expect(screen.getByRole('status').textContent).toBe('3 of 3');
  });

  it('renders the reason, both detail shapes, notes and deploy notes', () => {
    render(<ChangelogPage changes={changes} releases={['release-2']} />);
    expect(screen.getByText('People who failed once had no way back in')).toBeTruthy();
    expect(screen.getByText('Prose detail about cooldowns')).toBeTruthy();
    expect(screen.getByText('Resume opens the last lesson you opened').tagName).toBe('LI');
    expect(screen.getByText('Background on why')).toBeTruthy();
    expect(screen.getByText('Deploy the functions first')).toBeTruthy();
    expect(screen.getAllByText('Background')).toHaveLength(1);
    const first = screen.getAllByRole('article')[0];
    expect(within(first as HTMLElement).getByText('New')).toBeTruthy();
    expect(within(first as HTMLElement).getByText('Quizzes & certificates')).toBeTruthy();
  });

  it('filters by search, area and kind, and says so when nothing matches', () => {
    render(<ChangelogPage changes={changes} releases={['release-2']} />);
    fireEvent.change(screen.getByLabelText('Search changes'), { target: { value: 'resume' } });
    expect(screen.getByRole('status').textContent).toBe('1 of 3');
    fireEvent.change(screen.getByLabelText('Search changes'), { target: { value: '' } });
    choose(screen.getByLabelText('Area'), 'Learning');
    expect(screen.getByRole('status').textContent).toBe('2 of 3');
    choose(screen.getByLabelText('Kind'), 'New');
    expect(screen.getByRole('status').textContent).toBe('0 of 3');
    expect(screen.getByRole('heading', { name: 'No change matches' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show every change' }));
    expect(screen.getByRole('status').textContent).toBe('3 of 3');
    expect(screen.getByLabelText('Area').textContent).toBe('Any area');
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();

    choose(screen.getByLabelText('Kind'), 'Fix');
    expect(screen.getByRole('status').textContent).toBe('1 of 3');
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('status').textContent).toBe('3 of 3');
  });

  it('pages 25 changes at a time, keeps the release total in the heading, and resets on a filter', () => {
    const many: Change[] = Array.from({ length: 30 }, (_, i) => ({
      file: `2026-10-27-1200${String(i).padStart(2, '0')}-x.ts`,
      release: 'release-9',
      date: '2026-10-27',
      id: `GH-${i}`,
      title: `Change ${String(i).padStart(2, '0')}`,
      area: 'LEARN',
      kind: 'fix',
      why: 'Because',
    }));
    render(<ChangelogPage changes={many} releases={['release-9']} />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('release-9 · 30 changes');
    expect(screen.getByText('Change 00')).toBeTruthy();
    expect(screen.queryByText('Change 25')).toBeNull();
    expect(screen.getByText('Showing 1–25 of 30')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Change 25')).toBeTruthy();
    expect(screen.queryByText('Change 00')).toBeNull();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('release-9 · 30 changes');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search changes' }), {
      target: { value: 'change' },
    });
    expect(screen.getByText('Showing 1–25 of 30')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    choose(screen.getByRole('combobox', { name: 'Area' }), 'Learning');
    expect(screen.getByText('Showing 1–25 of 30')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    choose(screen.getByRole('combobox', { name: 'Kind' }), 'Fix');
    expect(screen.getByText('Showing 1–25 of 30')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search changes' }), {
      target: { value: 'zzz' },
    });
    expect(screen.queryByRole('navigation', { name: 'Changes' })).toBeNull();
  });

  it('offers only the areas and kinds that entries use', () => {
    render(<ChangelogPage changes={changes} releases={[]} />);
    expect(optionNames(screen.getByLabelText('Area'))).toEqual([
      'Any area',
      'Learning',
      'Quizzes & certificates',
    ]);
    expect(optionNames(screen.getByLabelText('Kind'))).toEqual(['Any kind', 'Docs', 'New', 'Fix']);
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<ChangelogPage changes={changes} releases={['release-2']} />);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('renders the real entries by default', () => {
    render(<ChangelogPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Changelog' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Filter changes' })).toBeTruthy();
    expect(screen.getAllByRole('article')).toHaveLength(Math.min(CHANGES.length, 25));
  });
});

describe('formatDay', () => {
  it('formats a calendar day without shifting it across timezones', () => {
    expect(formatDay('2026-10-27')).toBe('27 Oct 2026');
  });
});
