import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Team } from '@gurukul/schema';
import { describe, expect, it, vi } from 'vitest';
import { axeViolations } from './axe';
import { fakeConsole } from './fake-console';
import { openApp } from './harness';

const admin = { roles: ['admin'] as Array<'admin'> };
const platform: Team = {
  id: 'platform',
  name: 'Platform',
  memberEmails: ['a@nonstopio.com', 'b@nonstopio.com'],
  createdAt: 5,
};
const bare: Team = { id: 'qa', name: 'QA', memberEmails: [], createdAt: 0 };
const PATH = '/admin/teams';

const dialog = () => screen.getByRole('dialog');
const paste = (text: string) =>
  fireEvent.paste(within(dialog()).getByRole('combobox', { name: 'Members' }), {
    clipboardData: { getData: () => text },
  });
const nameField = () => within(dialog()).getByLabelText('Team name');

describe('Teams page', () => {
  it('lists teams with member counts, a team with no document as empty', async () => {
    const c = fakeConsole({
      teamList: [
        platform,
        bare,
        { ...platform, id: 'x', name: 'Solo', memberEmails: ['s@nonstopio.com'] },
      ],
    });
    const { container } = await openApp(PATH, { ...admin, console: c });
    expect(await screen.findByRole('heading', { level: 1, name: 'Teams' })).toBeTruthy();
    const table = await screen.findByRole('table', { name: 'Teams' });
    expect(within(table).getByText('2 members')).toBeTruthy();
    expect(within(table).getByText('No members yet')).toBeTruthy();
    expect(within(table).getByText('1 member')).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('shows a skeleton, then a first-team empty state', async () => {
    await openApp(PATH, { ...admin, console: fakeConsole() });
    expect(await screen.findByText('No teams yet')).toBeTruthy();
    const buttons = screen.getAllByRole('button', { name: 'Create team' });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1] as HTMLElement);
    expect(screen.getByRole('dialog', { name: 'Create team' })).toBeTruthy();
  });

  it('says it did not load, and loads again on Retry', async () => {
    const c = fakeConsole({ teamList: [platform] });
    vi.mocked(c.data.teamList).mockRejectedValueOnce(new Error('offline'));
    await openApp(PATH, { ...admin, console: c });
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Platform')).toBeTruthy();
  });

  it('is for Admins only', async () => {
    await openApp(PATH, { roles: [] });
    expect(screen.queryByRole('heading', { name: 'Teams' })).toBeNull();
  });
});

describe('Create team', () => {
  it('creates a team with pasted members, each marked signed in, invited or invalid', async () => {
    const c = fakeConsole({ teamList: [platform] });
    c.data.knownEmails = vi.fn().mockResolvedValue({
      signedIn: new Set(['a@nonstopio.com']),
      assigned: new Set(),
      byCourse: {},
    });
    const { container } = await openApp(PATH, { ...admin, console: c });
    fireEvent.click(
      (await screen.findAllByRole('button', { name: 'Create team' }))[0] as HTMLElement,
    );
    fireEvent.change(nameField(), { target: { value: '  Mobile ' } });
    paste('a@nonstopio.com, new@nonstopio.com\nnope@gmail.com');
    const chips = within(dialog()).getByRole('list', { name: 'Members: added people' });
    await waitFor(() => expect(chips.textContent).toContain('a@nonstopio.com· signed in'));
    expect(chips.textContent).toContain('new@nonstopio.com· invited');
    expect(chips.textContent).toContain('nope@gmail.com· Not an @nonstopio.com address');
    expect(await axeViolations(container)).toEqual([]);

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Create team' }));
    expect(await within(dialog()).findByRole('alert')).toHaveProperty(
      'textContent',
      'Fix or remove the addresses marked invalid.',
    );
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Remove nope@gmail.com' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Create team' }));
    await waitFor(() => expect(c.data.saveTeam).toHaveBeenCalled());
    const [saved, previous] = vi.mocked(c.data.saveTeam).mock.calls[0] as [Team, string | null];
    expect(saved).toMatchObject({
      id: 'mobile',
      name: 'Mobile',
      memberEmails: ['a@nonstopio.com', 'new@nonstopio.com'],
    });
    expect(saved.createdAt).toBeGreaterThan(5);
    expect(previous).toBeNull();
    expect(await screen.findByText('Created Mobile')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(c.data.teamList).toHaveBeenCalledTimes(2);
  });

  it('wants a name, a unique name and at least one member', async () => {
    const c = fakeConsole({ teamList: [platform] });
    await openApp(PATH, { ...admin, console: c });
    fireEvent.click(
      (await screen.findAllByRole('button', { name: 'Create team' }))[0] as HTMLElement,
    );
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Create team' }));
    expect(await within(dialog()).findByText('Enter a team name.')).toBeTruthy();
    fireEvent.change(nameField(), { target: { value: 'platform' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Create team' }));
    expect(await within(dialog()).findByText('platform is already in the list.')).toBeTruthy();
    fireEvent.change(nameField(), { target: { value: 'Platform!' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Create team' }));
    expect(
      await within(dialog()).findByText(
        'A team with a very similar name exists. Use a different name.',
      ),
    ).toBeTruthy();
    fireEvent.change(nameField(), { target: { value: 'Quality' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Create team' }));
    expect(await within(dialog()).findByText('Add at least one member.')).toBeTruthy();
    expect(c.data.saveTeam).not.toHaveBeenCalled();
    paste('a@nonstopio.com');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Create team' }));
    await waitFor(() =>
      expect(c.data.saveTeam).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'quality', memberEmails: ['a@nonstopio.com'] }),
        null,
      ),
    );
  });

  it('refuses a team over the member limit', async () => {
    const c = fakeConsole();
    await openApp(PATH, { ...admin, console: c });
    fireEvent.click(
      (await screen.findAllByRole('button', { name: 'Create team' }))[0] as HTMLElement,
    );
    fireEvent.change(nameField(), { target: { value: 'Everyone' } });
    paste(Array.from({ length: 501 }, (_, i) => `p${i}@nonstopio.com`).join(' '));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Create team' }));
    expect(await within(dialog()).findByText('A team holds at most 500 people.')).toBeTruthy();
  });

  it('keeps the dialog and says so when saving fails; Cancel closes it', async () => {
    const c = fakeConsole();
    vi.mocked(c.data.saveTeam).mockRejectedValueOnce(new Error('permission-denied'));
    await openApp(PATH, { ...admin, console: c });
    fireEvent.click(
      (await screen.findAllByRole('button', { name: 'Create team' }))[0] as HTMLElement,
    );
    fireEvent.change(nameField(), { target: { value: 'Mobile' } });
    paste('a@nonstopio.com');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Create team' }));
    expect(await screen.findByText('Could not save the team. Try again.')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Edit and delete', () => {
  it('edits a team: renamed, members changed, creation date kept, old name passed on', async () => {
    const c = fakeConsole({ teamList: [platform] });
    await openApp(PATH, { ...admin, console: c });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Platform' }));
    expect(nameField()).toHaveProperty('value', 'Platform');
    fireEvent.change(nameField(), { target: { value: 'Platform' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Remove b@nonstopio.com' }));
    paste('c@nonstopio.com');
    fireEvent.change(nameField(), { target: { value: 'Cloud' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save team' }));
    await waitFor(() =>
      expect(c.data.saveTeam).toHaveBeenCalledWith(
        {
          id: 'platform',
          name: 'Cloud',
          memberEmails: ['a@nonstopio.com', 'c@nonstopio.com'],
          createdAt: 5,
        },
        'Platform',
      ),
    );
    expect(await screen.findByText('Saved Cloud')).toBeTruthy();
  });

  it('wants a member on edit too, and stamps a team that had no document yet', async () => {
    const c = fakeConsole({ teamList: [bare] });
    await openApp(PATH, { ...admin, console: c });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit QA' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save team' }));
    expect(await within(dialog()).findByText('Add at least one member.')).toBeTruthy();
    expect(c.data.saveTeam).not.toHaveBeenCalled();
    paste('q@nonstopio.com');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save team' }));
    await waitFor(() => expect(c.data.saveTeam).toHaveBeenCalled());
    const [saved, previous] = vi.mocked(c.data.saveTeam).mock.calls[0] as [Team, string | null];
    expect(saved.createdAt).toBeGreaterThan(0);
    expect(previous).toBe('QA');
  });

  it('deletes only after a confirmation', async () => {
    const c = fakeConsole({ teamList: [platform] });
    await openApp(PATH, { ...admin, console: c });
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Platform' }));
    expect(within(dialog()).getByText(/keep it on their profile/)).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Keep team' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(c.data.deleteTeam).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Platform' }));
    fireEvent.keyDown(dialog(), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Platform' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete Platform' }));
    await waitFor(() => expect(c.data.deleteTeam).toHaveBeenCalledWith(platform));
    expect(await screen.findByText('Deleted Platform')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(c.data.teamList).toHaveBeenCalledTimes(2);
  });

  it('keeps the team and says so when deleting fails', async () => {
    const c = fakeConsole({ teamList: [platform] });
    vi.mocked(c.data.deleteTeam).mockRejectedValueOnce(new Error('offline'));
    await openApp(PATH, { ...admin, console: c });
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Platform' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete Platform' }));
    expect(await screen.findByText('Could not delete the team. Try again.')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
