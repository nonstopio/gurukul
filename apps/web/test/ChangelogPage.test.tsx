import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChangelogPage, formatDay } from '../src/changelog/ChangelogPage';
import { CHANGES, type Change } from '../src/changelog';
import { axeViolations } from './axe';

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
    fireEvent.change(screen.getByLabelText('Area'), { target: { value: 'LEARN' } });
    expect(screen.getByRole('status').textContent).toBe('2 of 3');
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'feature' } });
    expect(screen.getByRole('status').textContent).toBe('0 of 3');
    expect(screen.getByText(/No change matches/)).toBeTruthy();
  });

  it('offers only the areas and kinds that entries use', () => {
    render(<ChangelogPage changes={changes} releases={[]} />);
    const areaOptions = within(screen.getByLabelText('Area')).getAllByRole('option');
    expect(areaOptions.map((o) => o.textContent)).toEqual([
      'All areas',
      'Learning',
      'Quizzes & certificates',
    ]);
    const kindOptions = within(screen.getByLabelText('Kind')).getAllByRole('option');
    expect(kindOptions.map((o) => o.textContent)).toEqual(['All kinds', 'Docs', 'New', 'Fix']);
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<ChangelogPage changes={changes} releases={['release-2']} />);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('renders the real entries by default', () => {
    render(<ChangelogPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Changelog' })).toBeTruthy();
    expect(screen.getAllByRole('article')).toHaveLength(CHANGES.length);
  });
});

describe('formatDay', () => {
  it('formats a calendar day without shifting it across timezones', () => {
    expect(formatDay('2026-10-27')).toBe('27 Oct 2026');
  });
});
