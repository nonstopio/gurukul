import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { DEFAULT_ORG_CONFIG } from '@gurukul/schema';
import { describe, expect, it, vi } from 'vitest';
import { axeViolations } from './axe';
import { fakeConsole } from './fake-console';
import { openApp } from './harness';

const admin = { roles: ['admin'] as Array<'admin'> };
const saveButton = () => screen.getByRole('button', { name: 'Save settings' }) as HTMLButtonElement;

describe('Org settings', () => {
  it('starts empty, with reminders off and nothing to save', async () => {
    const { container } = await openApp('/admin/settings', { ...admin });
    expect(await screen.findByText('No teams yet')).toBeTruthy();
    expect(
      (screen.getByRole('switch', { name: 'Send daily reminders' }) as HTMLInputElement).checked,
    ).toBe(false);
    expect(saveButton().disabled).toBe(true);
    expect(screen.queryByText('You have unsaved changes.')).toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('adds and removes teams, turns reminders on and saves the whole document', async () => {
    const c = fakeConsole({ settings: { teams: ['QA'] } });
    const { container } = await openApp('/admin/settings', { ...admin, console: c });
    const list = await screen.findByRole('list', { name: 'Teams' });
    expect(within(list).getByText('QA')).toBeTruthy();

    const input = screen.getByLabelText('New team');
    fireEvent.click(screen.getByRole('button', { name: 'Add team' }));
    expect(await screen.findByText('Enter a team name.')).toBeTruthy();
    fireEvent.change(input, { target: { value: 'qa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add team' }));
    expect(await screen.findByText('qa is already in the list.')).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);

    fireEvent.change(input, { target: { value: ' Mobile ' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(await within(list).findByText('Mobile')).toBeTruthy();
    expect(screen.queryByText('qa is already in the list.')).toBeNull();
    expect((input as HTMLInputElement).value).toBe('');
    expect(screen.getByText('You have unsaved changes.')).toBeTruthy();

    fireEvent.click(within(list).getByRole('button', { name: 'Remove QA' }));
    expect(within(list).queryByText('QA')).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: 'Send daily reminders' }));
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(c.data.saveOrgSettings).toHaveBeenCalledWith({
        domain: 'nonstopio.com',
        teams: ['Mobile'],
        reminders: { enabled: true },
        signatory: DEFAULT_ORG_CONFIG.signatory,
      }),
    );
    expect(await screen.findByText('Settings saved')).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
    expect(screen.queryByText('You have unsaved changes.')).toBeNull();
  });

  it('counts turning reminders off and back on as no change', async () => {
    await openApp('/admin/settings', { ...admin });
    const toggle = await screen.findByRole('switch', { name: 'Send daily reminders' });
    fireEvent.click(toggle);
    expect(saveButton().disabled).toBe(false);
    fireEvent.click(toggle);
    expect(saveButton().disabled).toBe(true);
  });

  it('saves a trimmed signatory and will not save one with a blank name or role', async () => {
    const c = fakeConsole();
    await openApp('/admin/settings', { ...admin, console: c });
    const name = await screen.findByLabelText('Signatory name');
    expect((name as HTMLInputElement).value).toBe(DEFAULT_ORG_CONFIG.signatory.name);

    fireEvent.change(name, { target: { value: '  ' } });
    expect(screen.getByText('Enter both a name and a role to save.')).toBeTruthy();
    expect(saveButton().disabled).toBe(true);

    fireEvent.change(name, { target: { value: ' Ravi Sample ' } });
    fireEvent.change(screen.getByLabelText('Signatory role'), { target: { value: ' Dean ' } });
    expect(screen.queryByText('Enter both a name and a role to save.')).toBeNull();
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(c.data.saveOrgSettings).toHaveBeenCalledWith(
        expect.objectContaining({ signatory: { name: 'Ravi Sample', role: 'Dean' } }),
      ),
    );
    expect(saveButton().disabled).toBe(true);
  });

  it('keeps the edits and says so when saving fails', async () => {
    const c = fakeConsole();
    let reject: (e: Error) => void = () => {};
    vi.mocked(c.data.saveOrgSettings).mockReturnValue(
      new Promise((_, r) => {
        reject = r;
      }),
    );
    await openApp('/admin/settings', { ...admin, console: c });
    fireEvent.click(await screen.findByRole('switch', { name: 'Send daily reminders' }));
    fireEvent.click(saveButton());
    const saving = await screen.findByRole('button', { name: 'Saving…' });
    expect((saving as HTMLButtonElement).disabled).toBe(true);
    reject(new Error('permission-denied'));
    expect(await screen.findByText('Could not save the settings. Try again.')).toBeTruthy();
    expect(saveButton().disabled).toBe(false);
    expect(screen.getByText('You have unsaved changes.')).toBeTruthy();
  });
});
