import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '../src/api';
import { axeViolations } from './axe';
import { fakeConsole } from './fake-console';
import { openApp } from './harness';
import { choose } from './select';

vi.mock('@gurukul/ui/tokens.css?raw', async () => {
  const { readFileSync } = await import('node:fs');
  return { default: readFileSync('../../packages/ui/src/tokens.css', 'utf8') };
});

const EMAIL = 'priya@nonstopio.com';
const admin = { roles: ['admin'] as Array<'admin'> };

describe('Email templates', () => {
  it('lists every template with its subject and text, and has no accessibility violations', async () => {
    const { container } = await openApp('/admin/emails', { ...admin });
    expect(await screen.findByRole('region', { name: 'Course assigned' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Certificate revoked' })).toBeTruthy();
    expect(screen.getByText('New course on NonStop Academy: Sample course')).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('sends the selected template to the address filled in for the Admin, and says where it went', async () => {
    const c = fakeConsole();
    await openApp('/admin/emails', { ...admin, console: c });
    choose(await screen.findByLabelText('Template'), 'Certificate revoked');
    expect(screen.getByRole('button', { name: `Remove ${EMAIL}` })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Send test email' }));
    await waitFor(() =>
      expect(c.service.sendTestEmail).toHaveBeenCalledWith({
        templateId: 'revoked',
        recipients: [EMAIL],
      }),
    );
    expect(await screen.findByText(`Test email sent to ${EMAIL}`)).toBeTruthy();
  });

  it('sends to two addresses, and refuses none and other domains', async () => {
    const c = fakeConsole();
    await openApp('/admin/emails', { ...admin, console: c });
    const send = await screen.findByRole('button', { name: 'Send test email' });
    const pick = (label: string, email: string) => {
      const input = screen.getByRole('combobox', { name: label });
      fireEvent.change(input, { target: { value: email } });
      fireEvent.keyDown(input, { key: 'Enter' });
    };

    fireEvent.click(screen.getByRole('button', { name: `Remove ${EMAIL}` }));
    fireEvent.click(send);
    expect(await screen.findByText('Enter at least one email address.')).toBeTruthy();

    pick('Second email address (optional)', 'x@example.com');
    fireEvent.click(send);
    expect(await screen.findByText('Use @nonstopio.com addresses.')).toBeTruthy();
    expect(c.service.sendTestEmail).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Remove x@example.com' }));
    pick('First email address', 'a@nonstopio.com');
    pick('Second email address (optional)', 'b@nonstopio.com');
    fireEvent.click(send);
    await waitFor(() =>
      expect(c.service.sendTestEmail).toHaveBeenCalledWith({
        templateId: 'assigned',
        recipients: ['a@nonstopio.com', 'b@nonstopio.com'],
      }),
    );
    expect(
      await screen.findByText('Test email sent to a@nonstopio.com and b@nonstopio.com'),
    ).toBeTruthy();
    expect(screen.queryByText('Use @nonstopio.com addresses.')).toBeNull();
  });

  it('shows the catalog message when the send is refused, and a plain one otherwise', async () => {
    const c = fakeConsole();
    vi.mocked(c.service.sendTestEmail)
      .mockRejectedValueOnce(
        new ApiClientError(503, [
          {
            code: 'GEN_5004',
            title: 'Email not set up',
            category: 'GENERIC',
            retryable: true,
            userMessage: 'Email is not set up.',
            developerMessage: 'x',
            details: {},
            traceId: 't',
          },
        ]),
      )
      .mockRejectedValueOnce(new Error('x'));
    await openApp('/admin/emails', { ...admin, console: c });
    const send = await screen.findByRole('button', { name: 'Send test email' });
    fireEvent.click(send);
    expect(await screen.findByText('Email is not set up.')).toBeTruthy();
    fireEvent.click(send);
    expect(await screen.findByText('Could not send the test email. Try again.')).toBeTruthy();
  });
});
