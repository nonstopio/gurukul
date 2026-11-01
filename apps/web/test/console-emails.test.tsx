import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '../src/api';
import { axeViolations } from './axe';
import { fakeConsole } from './fake-console';
import { openApp } from './harness';

vi.mock('@gurukul/ui/tokens.css?raw', async () => {
  const { readFileSync } = await import('node:fs');
  return { default: readFileSync('../../packages/ui/src/tokens.css', 'utf8') };
});

const admin = { roles: ['admin'] as Array<'admin'> };

describe('Email templates', () => {
  it('lists every template with its subject and text, and has no accessibility violations', async () => {
    const { container } = await openApp('/admin/emails', { ...admin });
    expect(await screen.findByRole('region', { name: 'Course assigned' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Certificate revoked' })).toBeTruthy();
    expect(screen.getByText('New course on NonStop Academy: Sample course')).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('sends the selected template and says where it went', async () => {
    const c = fakeConsole();
    await openApp('/admin/emails', { ...admin, console: c });
    fireEvent.change(await screen.findByLabelText('Template'), { target: { value: 'revoked' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send test email' }));
    await waitFor(() =>
      expect(c.service.sendTestEmail).toHaveBeenCalledWith({ templateId: 'revoked' }),
    );
    expect(await screen.findByText('Test email sent to admin@nonstopio.com')).toBeTruthy();
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
