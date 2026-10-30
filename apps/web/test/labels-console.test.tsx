import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeConsole, userRow } from './fake-console';
import { fakeData } from './fake-data';
import { openApp } from './harness';

const gurukulAdmin = { roles: ['admin'] as Array<'admin'>, labels: 'gurukul' as const };

describe('the console in Gurukul names', () => {
  it('names the Overview, its figures and the empty failed list', async () => {
    await openApp('/admin', { ...gurukulAdmin, data: fakeData({ courses: [] }) });
    expect(await screen.findByText('No Shishyas yet')).toBeTruthy();
    expect(screen.getByText('Kulapati · Sanjaya')).toBeTruthy();
    expect(screen.getByText('Active Shishyas (30 days)')).toBeTruthy();
    expect(screen.getByText('Average Pariksha score')).toBeTruthy();
    expect(await screen.findByText('No one has failed a Pariksha twice.')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Shishyas' }).length).toBeGreaterThan(0);
  });

  it('names the course analytics', async () => {
    await openApp('/admin/courses/git', { ...gurukulAdmin, console: fakeConsole() });
    expect(await screen.findByRole('link', { name: 'Edit in Vyasa Studio' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Where Shishyas stop' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Parikshas' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Pariksha' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Edit this Pariksha' })).toBeTruthy();
  });

  it('names the audit log actions and details', async () => {
    const audit = [
      {
        id: 'a1',
        at: null,
        by: 'admin@nonstopio.com',
        action: 'roles.set',
        target: 'u2',
        detail: { educator: true, admin: true },
      },
      { id: 'a2', at: null, by: 'x', action: 'roles.bootstrap', target: null, detail: {} },
      { id: 'a3', at: null, by: 'x', action: 'cooldown.reset', target: null, detail: {} },
    ];
    await openApp('/admin/audit', { ...gurukulAdmin, console: fakeConsole({ audit }) });
    expect(await screen.findByText('Now Acharya and Kulapati')).toBeTruthy();
    expect(screen.getByText('Shishya only')).toBeTruthy();
    expect(screen.getByText('Granted the first Kulapati role')).toBeTruthy();
    expect(screen.getByText('Opened a Pariksha retake')).toBeTruthy();
  });

  it('names the settings copy', async () => {
    await openApp('/admin/settings', { ...gurukulAdmin, console: fakeConsole() });
    expect(await screen.findByText(/remind people from Shishyas\./)).toBeTruthy();
  });

  it('names the teams copy', async () => {
    await openApp('/admin/teams', { ...gurukulAdmin, console: fakeConsole() });
    expect(await screen.findByText(/Shishyas also pick their own team/)).toBeTruthy();
  });

  it('names the assign toggle', async () => {
    await openApp(
      { pathname: '/admin/assign', state: { courseId: 'git', emails: ['a@nonstopio.com'] } },
      { ...gurukulAdmin, console: fakeConsole() },
    );
    await screen.findByLabelText(/Git, the NonStop Way/);
    for (const step of ['Who is it for?', 'Set the deadline']) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      await screen.findByRole('heading', { name: step });
    }
    expect(screen.getByLabelText('Email Shishyas now')).toBeTruthy();
  });

  it('names the roles, the matrix and the grant dialog', async () => {
    const me = userRow(0, { uid: 'u1', displayName: 'Me', roles: ['learner', 'admin'] });
    const c = fakeConsole({ users: [me], found: [me] });
    await openApp('/admin/roles', { ...gurukulAdmin, console: c });
    expect(await screen.findByRole('heading', { name: 'Acharyas' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Kulapatis' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'No Acharyas yet' })).toBeTruthy();
    expect(screen.getByText('See all Shishyas and analytics')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Shishya' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit Me as Kulapati' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Grant a role' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(
      within(dialog).getByRole('combobox', { name: 'Find a person by name or email' }),
      {
        target: { value: 'me' },
      },
    );
    fireEvent.mouseDown(await within(dialog).findByRole('option', { name: /Me/ }));
    expect(await within(dialog).findByText(/Everyone is a Shishya\./)).toBeTruthy();
    expect(within(dialog).getByRole('switch', { name: /Acharya/ })).toBeTruthy();
    expect(
      within(dialog).getByText('You cannot remove your own Kulapati role. Ask another Kulapati.'),
    ).toBeTruthy();
  });

  it('names the learners list, its filters and the bulk role dialog', async () => {
    const c = fakeConsole({
      users: [
        userRow(1, { displayName: 'Priya', roles: ['learner', 'educator'] }),
        userRow(2, { displayName: 'Rohan' }),
      ],
    });
    await openApp('/admin/learners', { ...gurukulAdmin, console: c });
    await screen.findByLabelText('Select Rohan');
    expect(screen.getByRole('cell', { name: 'Acharya' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'Shishya' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Shishyas' })).toBeTruthy();
    expect(screen.getByRole('tablist', { name: 'Shishya groups' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Kulapati' })).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Select Rohan'));
    fireEvent.click(screen.getByRole('button', { name: 'Change role' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Acharya and Kulapati are separate/)).toBeTruthy();
    expect(within(dialog).getByRole('option', { name: 'Make Kulapati' })).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Acharya'), { target: { value: 'remove' } });
    expect(
      within(dialog).getByText('Removing Acharya also clears their granted courses.'),
    ).toBeTruthy();
  });
});
