import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
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

  it('saves a new team, and says so when the save fails', async () => {
    const data = fakeData({ teams: ['QA', 'Dev'] });
    await openApp('/profile', { data });
    const team = await screen.findByLabelText('Team');
    const save = screen.getByRole('button', { name: 'Save team' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(team, { target: { value: 'Dev' } });
    await act(async () => fireEvent.click(save));
    expect(data.data.setTeam).toHaveBeenCalledWith('u1', 'Dev');
    expect(await screen.findByText('Team saved')).toBeTruthy();

    data.data.setTeam = vi.fn().mockRejectedValue(new Error('denied'));
    fireEvent.change(team, { target: { value: 'QA' } });
    await act(async () => fireEvent.click(save));
    expect(await screen.findByText('Could not save your team. Try again.')).toBeTruthy();
  });

  it('clears a saved team with "No team"', async () => {
    const data = fakeData({ teams: ['QA'] });
    await openApp('/profile', { data, team: 'QA' });
    fireEvent.change(await screen.findByLabelText('Team'), { target: { value: '' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save team' })));
    expect(data.data.setTeam).toHaveBeenCalledWith('u1', null);
  });

  it('says where teams come from when the org has none', async () => {
    await openApp('/profile', { labels: 'gurukul' });
    expect(
      await screen.findByText('No teams yet: your Kulapati adds them on the Teams page.'),
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
});
