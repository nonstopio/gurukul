import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '@gurukul/ui';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../src/auth/AuthProvider';
import type { ProfileMirror } from '../src/auth/service';
import { DataProvider } from '../src/data/DataProvider';
import { appRoutes } from '../src/routes';
import { axeViolations } from './axe';
import { NONSTOP, fakeAuth } from './fake-auth';
import { fakeData } from './fake-data';

/** Home for a Shishya whose profile carries `profile` (no team by default). */
async function home(
  data = fakeData({ teams: ['QA', 'Dev'] }),
  profile: Partial<ProfileMirror> = { team: null },
) {
  const f = fakeAuth();
  const router = createMemoryRouter(appRoutes(), { initialEntries: ['/'] });
  const view = render(
    <AuthProvider service={f.service}>
      <DataProvider data={data.data}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </DataProvider>
    </AuthProvider>,
  );
  await act(async () => {
    f.emitUser(NONSTOP);
    await Promise.resolve();
  });
  const emit = (p: Partial<ProfileMirror>) =>
    act(() => f.emitProfile({ roles: ['shishya'], displayName: 'P', ...p } as ProfileMirror));
  emit(profile);
  return { ...view, ...data, emit };
}

describe('Team prompt on Home', () => {
  it('asks a learner with no team to pick one from the org list, and hides once saved', async () => {
    const { data, emit, container } = await home();
    expect(await screen.findByRole('heading', { name: 'Which team are you in?' })).toBeTruthy();
    const save = screen.getByRole('button', { name: 'Save team' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Choose your team',
      'QA',
      'Dev',
    ]);
    expect(await axeViolations(container)).toEqual([]);

    fireEvent.change(screen.getByLabelText('Team'), { target: { value: 'Dev' } });
    fireEvent.click(save);
    expect(data.setTeam).toHaveBeenCalledWith('u1', 'Dev');

    emit({ team: 'Dev' });
    expect(screen.queryByRole('heading', { name: 'Which team are you in?' })).toBeNull();
  });

  it('treats a profile without a team field as having none', async () => {
    await home(undefined, {});
    expect(await screen.findByRole('heading', { name: 'Which team are you in?' })).toBeTruthy();
  });

  it('says so when the team is not saved', async () => {
    const d = fakeData({ teams: ['QA'] });
    vi.mocked(d.data.setTeam).mockRejectedValueOnce(new Error('permission-denied'));
    await home(d);
    fireEvent.change(await screen.findByLabelText('Team'), { target: { value: 'QA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save team' }));
    expect(await screen.findByText('Could not save your team. Try again.')).toBeTruthy();
  });

  it('asks nothing when the Kulapati has listed no teams', async () => {
    const { data } = await home(fakeData());
    await waitFor(() => expect(data.orgTeams).toHaveBeenCalled());
    expect(await screen.findByText('Nothing assigned yet')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Which team are you in?' })).toBeNull();
  });

  it('asks nothing, and reads no teams, when the learner already has one', async () => {
    const { data } = await home(undefined, { team: 'QA' });
    expect(await screen.findByText('Nothing assigned yet')).toBeTruthy();
    expect(data.orgTeams).not.toHaveBeenCalled();
  });

  it('stays out of the way when the teams cannot be read', async () => {
    const d = fakeData({ teams: ['QA'] });
    vi.mocked(d.data.orgTeams).mockRejectedValueOnce(new Error('unavailable'));
    await home(d);
    expect(await screen.findByText('Nothing assigned yet')).toBeTruthy();
    await waitFor(() => expect(d.data.orgTeams).toHaveBeenCalled());
    expect(screen.queryByRole('heading', { name: 'Which team are you in?' })).toBeNull();
  });
});
