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
    expect(await screen.findByLabelText('Signatory name')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Org settings' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Organisation', selected: true })).toBeTruthy();
    for (const name of ['Daily reminders', 'Certificate signatory']) {
      expect(screen.getByRole('region', { name })).toBeTruthy();
    }
    expect(screen.queryByRole('region', { name: 'Teams' })).toBeNull();
    expect(
      (screen.getByRole('switch', { name: 'Send daily reminders' }) as HTMLInputElement).checked,
    ).toBe(false);
    expect(saveButton().disabled).toBe(true);
    expect(screen.queryByText('You have unsaved changes.')).toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('shows a skeleton while the settings load, and Retry when they fail', async () => {
    const c = fakeConsole();
    let fail: (e: Error) => void = () => {};
    vi.mocked(c.data.orgSettings)
      .mockReturnValueOnce(
        new Promise((_, r) => {
          fail = r;
        }),
      )
      .mockResolvedValue(DEFAULT_ORG_CONFIG);
    await openApp('/admin/settings', { ...admin, console: c });
    expect(screen.getByRole('heading', { level: 1, name: 'Org settings' })).toBeTruthy();
    const panel = screen.getByRole('tabpanel', { name: 'Organisation' });
    expect(within(panel).getByRole('status').getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByRole('button', { name: 'Save settings' })).toBeNull();
    fail(new Error('offline'));
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByLabelText('Signatory name')).toBeTruthy();
  });

  it('turns reminders on and saves the document with the team names it was given', async () => {
    const c = fakeConsole({ settings: { teams: ['QA'] } });
    const { container } = await openApp('/admin/settings', { ...admin, console: c });
    fireEvent.click(await screen.findByRole('switch', { name: 'Send daily reminders' }));
    expect(screen.getByText('You have unsaved changes.')).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(c.data.saveOrgSettings).toHaveBeenCalledWith({
        domain: 'nonstopio.com',
        teams: ['QA'],
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
    await waitFor(() => expect(saveButton().getAttribute('aria-busy')).toBe('true'));
    expect(saveButton().disabled).toBe(true);
    reject(new Error('permission-denied'));
    expect(await screen.findByText('Could not save the settings. Try again.')).toBeTruthy();
    expect(saveButton().disabled).toBe(false);
    expect(screen.getByText('You have unsaved changes.')).toBeTruthy();
  });
});

describe('Org settings tabs', () => {
  it('keeps the tab in the URL and loads the design system only when it is opened', async () => {
    const { router } = await openApp('/admin/settings', { ...admin });
    await screen.findByLabelText('Signatory name');
    expect(screen.queryByRole('tab', { name: 'Tokens' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Design system' }));
    expect(router.state.location.search).toBe('?tab=design-system');
    expect(await screen.findByRole('tab', { name: 'Tokens', selected: true })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Organisation' }));
    expect(router.state.location.search).toBe('?tab=organisation');
    expect(screen.queryByRole('tab', { name: 'Tokens' })).toBeNull();
  });
});
