import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axeViolations } from './axe';
import { certificateRow, fakeData, progressRow } from './fake-data';
import { openApp } from './harness';

describe('Profile', () => {
  it('shows who you are, your roles and your learning in numbers', async () => {
    const data = fakeData({
      progress: [
        progressRow({ courseId: 'a', completedAt: null }),
        progressRow({ courseId: 'b', completedAt: new Date('2026-10-01') }),
      ],
      certificates: [certificateRow({ id: 'c1' }), certificateRow({ id: 'c2', revoked: true })],
    });
    const { container } = await openApp('/profile', { data, roles: ['educator', 'admin'] });
    expect(await screen.findByRole('heading', { level: 1, name: 'Priya N' })).toBeTruthy();
    expect(screen.getAllByText('priya@nonstopio.com').length).toBeGreaterThan(0);
    const roles = screen.getByRole('list', { name: 'Your roles' });
    expect(
      within(roles)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      'LearnerTakes courses and quizzes, and earns certificates.',
      'EducatorWrites and publishes courses in Studio.',
      'AdminAssigns courses, manages people and roles, and sets up the org.',
    ]);
    const learning = screen.getByRole('region', { name: 'Your learning' });
    await waitFor(() => expect(within(learning).getByText('In progress')).toBeTruthy());
    expect(learning.textContent).toContain('In progress1');
    expect(learning.textContent).toContain('Completed1');
    expect(learning.textContent).toContain('Certificates1');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('falls back to the email when Google gives no name', async () => {
    await openApp('/profile', { user: { displayName: null } });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'priya@nonstopio.com' }),
    ).toBeTruthy();
  });

  it('lists every team you are on, read only', async () => {
    const data = fakeData({ teams: ['QA', 'Dev', 'Design Ops'] });
    await openApp('/profile', { data, teamIds: ['qa', 'design-ops'] });
    const list = await screen.findByRole('list', { name: 'Your teams' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['QA', 'Design Ops']);
    expect(screen.queryByRole('button', { name: 'Save team' })).toBeNull();
    expect(screen.queryByLabelText('Team')).toBeNull();
  });

  it('says so, with a retry, when the team names cannot be read', async () => {
    const data = fakeData({ teams: ['QA'] });
    data.data.orgTeams = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(['QA']);
    await openApp('/profile', { data, teamIds: ['qa'] });
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    const list = await screen.findByRole('list', { name: 'Your teams' });
    expect(within(list).getByText('QA')).toBeTruthy();
  });

  it('skips a team that is no longer on the org list', async () => {
    const data = fakeData({ teams: ['QA'] });
    await openApp('/profile', { data, teamIds: ['qa', 'retired'] });
    const list = await screen.findByRole('list', { name: 'Your teams' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  });

  it('says so when you are on no team', async () => {
    const data = fakeData({ teams: ['QA'] });
    await openApp('/profile', { data, labels: 'gurukul' });
    expect(
      await screen.findByText('You are not on a team yet. Your Kulapati adds people to teams.'),
    ).toBeTruthy();
  });

  it('switches the names Gurukul uses, and signs out', async () => {
    const { data, auth } = await openApp('/profile');
    const names = screen.getByRole('group', { name: 'Names' });
    expect(
      within(names).getByRole('button', { name: 'Plain English' }).getAttribute('aria-pressed'),
    ).toBe('true');
    fireEvent.click(within(names).getByRole('button', { name: 'Gurukul names' }));
    expect(data.data.setLabels).toHaveBeenCalledWith('u1', 'gurukul');
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(auth.service.signOut).toHaveBeenCalled();
  });

  it('is reached from the account menu', async () => {
    const { router } = await openApp('/');
    fireEvent.click(await screen.findByRole('button', { name: /^Account: / }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Profile' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/profile'));
    fireEvent.click(screen.getByRole('button', { name: /^Account: / }));
    fireEvent.click(screen.getByRole('menuitem', { name: "What's new" }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/changelog'));
  });

  it('the account menu cycles the theme', async () => {
    await openApp('/');
    fireEvent.click(await screen.findByRole('button', { name: /^Account: / }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^Theme/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Account: / }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^Theme/ }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    fireEvent.click(screen.getByRole('button', { name: /^Account: / }));
    expect(screen.getByRole('menuitem', { name: /^Theme/ })).toBeTruthy();
  });
});
