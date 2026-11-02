import { fireEvent, screen, waitFor } from '@testing-library/react';
import { DEFAULT_ORG_CONFIG } from '@gurukul/schema';
import { describe, expect, it, vi } from 'vitest';
import { axeViolations } from './axe';
import { fakeConsole } from './fake-console';
import { openApp } from './harness';

// Vitest empties every CSS import, `?raw` included; the browser build gets the real file.
vi.mock('@gurukul/ui/tokens.css?raw', async () => {
  const { readFileSync } = await import('node:fs');
  return { default: readFileSync('../../packages/ui/src/tokens.css', 'utf8') };
});

const admin = { roles: ['admin'] as Array<'admin'> };
const saveButton = () => screen.getByRole('button', { name: 'Save settings' }) as HTMLButtonElement;

describe('Org settings', () => {
  it('starts empty, with reminders off and nothing to save', async () => {
    const { container } = await openApp('/admin/settings', { ...admin });
    expect(await screen.findByLabelText('Signatory name')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Org settings' })).toBeTruthy();
    expect(screen.queryByRole('tab')).toBeNull();
    for (const name of ['Daily reminders', 'Certificate signatory', 'Uploads']) {
      expect(screen.getByRole('region', { name })).toBeTruthy();
    }
    expect(screen.queryByRole('region', { name: 'Teams' })).toBeNull();
    const reminders = screen.getByRole('switch', { name: 'Send daily reminders' });
    expect((reminders as HTMLInputElement).checked).toBe(false);
    expect(reminders.closest('label')?.className).toContain('g-togglecard');
    expect(reminders.getAttribute('aria-describedby')).toBeTruthy();
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
    expect(screen.getAllByRole('status').map((e) => e.getAttribute('aria-busy'))).toContain('true');
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

describe('Org settings: Uploads', () => {
  const image = () => screen.getByLabelText('Largest image (KB)') as HTMLInputElement;
  const pdf = () => screen.getByLabelText('Largest PDF (KB)') as HTMLInputElement;

  it('shows the defaults, the bounds and that lowering affects new uploads only', async () => {
    const { container } = await openApp('/admin/settings', { ...admin });
    await screen.findByLabelText('Largest image (KB)');
    expect(image().value).toBe('500');
    expect(pdf().value).toBe('1024');
    for (const field of [image(), pdf()]) {
      expect(field.min).toBe('50');
      expect(field.max).toBe('1024');
      expect(field.getAttribute('aria-describedby')).toBeTruthy();
    }
    expect(screen.getByText(/affects new uploads only/)).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('shows the saved limits', async () => {
    await openApp('/admin/settings', {
      ...admin,
      console: fakeConsole({ settings: { uploads: { imageMaxKB: 300, pdfMaxKB: 800 } } }),
    });
    await screen.findByLabelText('Largest image (KB)');
    expect([image().value, pdf().value]).toEqual(['300', '800']);
  });

  it('saves a lowered limit and keeps the other', async () => {
    const c = fakeConsole();
    await openApp('/admin/settings', { ...admin, console: c });
    await screen.findByLabelText('Largest image (KB)');
    fireEvent.change(image(), { target: { value: '300' } });
    expect(screen.getByText('You have unsaved changes.')).toBeTruthy();
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(c.data.saveOrgSettings).toHaveBeenCalledWith(
        expect.objectContaining({ uploads: { imageMaxKB: 300, pdfMaxKB: 1024 } }),
      ),
    );
    expect(await screen.findByText('Settings saved')).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
    fireEvent.change(pdf(), { target: { value: '600' } });
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(c.data.saveOrgSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({ uploads: { imageMaxKB: 300, pdfMaxKB: 600 } }),
      ),
    );
  });

  it('leaves uploads out of a save that did not touch them', async () => {
    const c = fakeConsole({ settings: { uploads: { imageMaxKB: 300, pdfMaxKB: 800 } } });
    await openApp('/admin/settings', { ...admin, console: c });
    fireEvent.click(await screen.findByRole('switch', { name: 'Send daily reminders' }));
    fireEvent.click(saveButton());
    await waitFor(() => expect(c.data.saveOrgSettings).toHaveBeenCalled());
    expect(vi.mocked(c.data.saveOrgSettings).mock.calls[0]?.[0]).not.toHaveProperty('uploads');
  });

  it.each([
    ['', 'Enter a whole number of KB.'],
    ['abc', 'Enter a whole number of KB.'],
    ['100.5', 'Enter a whole number of KB.'],
    ['49', 'Enter at least 50 KB.'],
    ['1025', 'Enter at most 1024 KB, the hard ceiling.'],
  ])('refuses %j with a clear message', async (typed, message) => {
    const { container } = await openApp('/admin/settings', { ...admin });
    await screen.findByLabelText('Largest image (KB)');
    fireEvent.change(image(), { target: { value: typed } });
    expect(screen.getByText(message)).toBeTruthy();
    expect(image().getAttribute('aria-invalid')).toBe('true');
    expect(saveButton().disabled).toBe(true);
    expect(await axeViolations(container)).toEqual([]);
    fireEvent.change(image(), { target: { value: '400' } });
    expect(screen.queryByText(message)).toBeNull();
    expect(saveButton().disabled).toBe(false);
  });

  it('checks the PDF limit too', async () => {
    await openApp('/admin/settings', { ...admin });
    await screen.findByLabelText('Largest PDF (KB)');
    fireEvent.change(pdf(), { target: { value: '5000' } });
    expect(pdf().getAttribute('aria-invalid')).toBe('true');
    expect(saveButton().disabled).toBe(true);
  });
});

describe('Design system moved out of Org settings', () => {
  it('sends the old tab link to its own page, keeping the section', async () => {
    const { router } = await openApp('/admin/settings?tab=design-system&section=type', {
      ...admin,
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Design system' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/admin/design-system');
    expect(router.state.location.search).toBe('?section=type');
  });

  it('redirects without a section when the old link had none', async () => {
    const { router } = await openApp('/admin/settings?tab=design-system', { ...admin });
    expect(await screen.findByRole('heading', { level: 1, name: 'Design system' })).toBeTruthy();
    expect(router.state.location.search).toBe('');
  });
});
