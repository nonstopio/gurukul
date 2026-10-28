import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AssignmentFull, UserRow } from '../src/console/types';
import { axeViolations } from './axe';
import { fakeConsole, userRow } from './fake-console';
import { certificateRow, progressRow } from './fake-data';
import { openApp } from './harness';

const kulapati = { roles: ['kulapati'] as Array<'kulapati'> };
const asg = (email: string, over: Partial<AssignmentFull> = {}): AssignmentFull => ({
  id: `${email}-${over.courseId ?? 'git'}`,
  email,
  uid: null,
  courseId: 'git',
  dueAt: null,
  assignedAt: new Date('2026-03-01T00:00:00Z'),
  mandatory: false,
  status: 'assigned',
  ...over,
});
const late = new Date(Date.now() - 5 * 86_400_000);
const users = [
  userRow(1, { displayName: 'Priya', team: 'QA', roles: ['shishya', 'acharya'] }),
  userRow(2, { displayName: 'Rohan' }),
];
const assignments = [
  asg('user1@nonstopio.com', { uid: 'u1', dueAt: late }),
  asg('new@nonstopio.com'),
];

function setup(over: Parameters<typeof fakeConsole>[0] = {}) {
  return fakeConsole({ users, assignments, teams: ['QA'], count: 2, ...over });
}

describe('Learners', () => {
  it('lists people with their courses, status and tab counts', async () => {
    const c = setup();
    const { container } = await openApp('/kulapati/learners', { ...kulapati, console: c });
    expect(await screen.findByText('Priya')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'All (3)' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Signed in (2)' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Pending invite (1)' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Overdue (1)' })).toBeTruthy();
    expect(screen.getAllByText('1 · 0 done').length).toBeGreaterThan(0);
    expect(screen.getByText('Overdue')).toBeTruthy();
    expect(screen.getByText('Acharya')).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('shows pending invites and overdue people on their own tabs', async () => {
    await openApp('/kulapati/learners', { ...kulapati, console: setup() });
    await screen.findByText('Priya');
    fireEvent.click(screen.getByRole('tab', { name: 'Pending invite (1)' }));
    expect(await screen.findByText('new@nonstopio.com')).toBeTruthy();
    expect(screen.getByText(/Invited 1 March 2026/)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Overdue (1)' }));
    expect(await screen.findByText('user1@nonstopio.com')).toBeTruthy();
  });

  it('shows an invite with no date, and the empty state', async () => {
    const c = setup({
      assignments: [asg('x@nonstopio.com', { assignedAt: null })],
      users: [],
      count: 0,
    });
    await openApp('/kulapati/learners', { ...kulapati, console: c });
    expect(await screen.findByText(/Invited$/)).toBeTruthy();
    expect(c.data.usersPage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: 'Signed in (0)' }));
    expect(await screen.findByText('No learners match these filters.')).toBeTruthy();
  });

  it('lists pending invites on "All", after everyone who signed in', async () => {
    await openApp('/kulapati/learners', { ...kulapati, console: setup() });
    const table = await screen.findByRole('table', { name: 'Learners' });
    await within(table).findByText('new@nonstopio.com');
    const rows = within(table)
      .getAllByRole('row')
      .map((r) => r.textContent);
    expect(rows.findIndex((t) => t?.includes('Rohan'))).toBeLessThan(
      rows.findIndex((t) => t?.includes('new@nonstopio.com')),
    );
  });

  it('filters by search, team, course and role', async () => {
    const c = setup({ found: [users[1] as UserRow], team: [users[0] as UserRow] });
    await openApp('/kulapati/learners', { ...kulapati, console: c });
    await screen.findByText('Priya');
    fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'ro' } });
    fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'rohan' } });
    await waitFor(() => expect(c.data.searchUsers).toHaveBeenCalledWith('rohan'));
    expect(c.data.searchUsers).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Rohan')).toBeTruthy();
    expect(screen.queryByText('new@nonstopio.com')).toBeNull();
    expect(screen.getByRole('tab', { name: 'All (1)' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search people'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Team'), { target: { value: 'QA' } });
    await waitFor(() => expect(c.data.usersInTeam).toHaveBeenCalledWith('QA'));
    fireEvent.change(screen.getByLabelText('Team'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Course'), { target: { value: 'git' } });
    expect(await screen.findByText('new@nonstopio.com')).toBeTruthy();
    expect(await screen.findByText('Priya')).toBeTruthy();
    expect(c.data.assignments).toHaveBeenCalledWith({ courseId: 'git' });
    fireEvent.change(screen.getByLabelText('Course'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'acharya' } });
    await screen.findByText('Priya');
    expect(screen.queryByText('Rohan')).toBeNull();
    expect(screen.queryByText('new@nonstopio.com')).toBeNull();
  });

  it('combines filters with each other and with the tab', async () => {
    const team = [
      userRow(1, { displayName: 'Priya', team: 'QA', roles: ['shishya', 'acharya'] }),
      userRow(3, { displayName: 'Meera', team: 'QA' }),
    ];
    const c = setup({ team });
    await openApp('/kulapati/learners', { ...kulapati, console: c });
    await screen.findByText('Priya');
    fireEvent.change(screen.getByLabelText('Team'), { target: { value: 'QA' } });
    expect(await screen.findByText('Meera')).toBeTruthy();
    expect(await screen.findByRole('tab', { name: 'All (2)' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Overdue (1)' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'acharya' } });
    expect(await screen.findByRole('tab', { name: 'All (1)' })).toBeTruthy();
    expect(screen.queryByText('Meera')).toBeNull();
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'user3' } });
    expect(await screen.findByRole('tab', { name: 'All (1)' })).toBeTruthy();
    expect(screen.getByText('Meera')).toBeTruthy();
    expect(c.data.searchUsers).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Search people'), { target: { value: '' } });
    fireEvent.click(await screen.findByRole('tab', { name: 'Overdue (1)' }));
    expect(await screen.findByText('Priya')).toBeTruthy();
    expect(screen.queryByText('Meera')).toBeNull();
  });

  it('reads the names of people on a course or overdue page that only assignments mention', async () => {
    const c = setup();
    await openApp('/kulapati/learners', { ...kulapati, console: c });
    await screen.findByText('Rohan');
    fireEvent.click(screen.getByRole('tab', { name: 'Overdue (1)' }));
    expect(await screen.findByText('Priya')).toBeTruthy();
    expect(c.data.usersByUid).toHaveBeenCalledWith(['u1']);
    expect(screen.queryByText('Rohan')).toBeNull();
  });

  it('pages through people using a cursor, and back', async () => {
    const many = Array.from({ length: 3 }, (_, i) =>
      userRow(i + 10, { displayName: `Person ${i}` }),
    );
    const c = setup({ users: many, count: 30 });
    c.data.usersPage = vi.fn(async (cursor: string | null) =>
      cursor === 'cursor-1'
        ? { rows: [userRow(99, { displayName: 'Page Two' })], nextCursor: null }
        : { rows: many, nextCursor: 'cursor-1' },
    );
    await openApp('/kulapati/learners', { ...kulapati, console: c });
    await screen.findByText('Showing 1–25 of 31');
    await screen.findByText('Person 0');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Page Two')).toBeTruthy();
    expect(screen.getByText('new@nonstopio.com')).toBeTruthy();
    expect(c.data.usersPage).toHaveBeenLastCalledWith('cursor-1', 25);
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    await screen.findByText('Person 0');
  });

  it('paginates a team client-side and clears the selection when the page changes', async () => {
    const team = Array.from({ length: 26 }, (_, i) =>
      userRow(i + 100, { displayName: `T${i}`, team: 'QA' }),
    );
    const c = setup({ team });
    await openApp('/kulapati/learners', { ...kulapati, console: c });
    await screen.findByText('Priya');
    fireEvent.change(screen.getByLabelText('Team'), { target: { value: 'QA' } });
    await screen.findByText('T0');
    fireEvent.click(screen.getByLabelText('Select T0'));
    expect(screen.getByText('1 selected')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('T25')).toBeTruthy();
    expect(screen.queryByText('1 selected')).toBeNull();
    expect(c.data.usersInTeam).toHaveBeenCalledTimes(1);
  });

  it('runs the bulk actions: assign, remind, change role and clear', async () => {
    const c = setup();
    const { router } = await openApp('/kulapati/learners', { ...kulapati, console: c });
    await screen.findByText('Priya');
    fireEvent.click(screen.getByLabelText('Select Priya'));
    fireEvent.click(screen.getByRole('button', { name: 'Send reminder' }));
    await waitFor(() =>
      expect(c.service.remindLearners).toHaveBeenCalledWith({ emails: ['user1@nonstopio.com'] }),
    );
    expect(await screen.findByText('Reminders sent: 1, skipped: 0')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Change role' }).getAttribute('href')).toBe(
      '/kulapati/roles',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByText('1 selected')).toBeNull();
    fireEvent.click(screen.getByLabelText('Select Priya'));
    fireEvent.click(screen.getByRole('button', { name: 'Assign course' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/kulapati/assign'));
    expect(router.state.location.state).toEqual({ emails: ['user1@nonstopio.com'] });
  });

  it('says so when reminders fail', async () => {
    const c = setup();
    c.service.remindLearners = vi.fn().mockRejectedValue(new Error('x'));
    await openApp('/kulapati/learners', { ...kulapati, console: c });
    await screen.findByText('Priya');
    fireEvent.click(screen.getByLabelText('Select Priya'));
    fireEvent.click(screen.getByRole('button', { name: 'Send reminder' }));
    expect(await screen.findByText('Could not send reminders. Try again.')).toBeTruthy();
  });

  describe('learner drawer', () => {
    const detail = () => {
      const c = setup();
      c.data.progressFor = vi.fn().mockResolvedValue([
        {
          ...progressRow({
            courseId: 'git',
            percent: 40,
            pariksha: {
              q1: { best: 0.5, passed: false, attempts: 2, lastAttemptAt: null },
              q2: { best: 0, passed: false, attempts: 0, lastAttemptAt: null },
              q3: { best: 1, passed: true, attempts: 1, lastAttemptAt: null },
            },
          }),
          uid: 'u1',
        },
        { ...progressRow({ courseId: 'unknown-course', percent: 0 }), uid: 'u1' },
      ]);
      c.data.certificatesFor = vi
        .fn()
        .mockResolvedValue([
          certificateRow(),
          certificateRow({ id: 'NSG-GIT-26-0002', revoked: true }),
        ]);
      return c;
    };

    it('shows courses, certificates and resets a cooldown', async () => {
      const c = detail();
      await openApp('/kulapati/learners', { ...kulapati, console: c });
      fireEvent.click(await screen.findByText('Priya'));
      const dialog = await screen.findByRole('dialog');
      expect((await within(dialog).findAllByText('Git, the NonStop Way')).length).toBeGreaterThan(
        0,
      );
      expect(within(dialog).getByText('unknown-course')).toBeTruthy();
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Reset cooldown for q1 (2 attempts)' }),
      );
      await waitFor(() =>
        expect(c.service.resetCooldown).toHaveBeenCalledWith({
          uid: 'u1',
          courseId: 'git',
          parikshaId: 'q1',
        }),
      );
      expect(await screen.findByText('Retake opened')).toBeTruthy();
      expect(
        await within(dialog).findByRole('button', { name: 'Reset cooldown for q3 (1 attempt)' }),
      ).toBeTruthy();
      expect(within(dialog).queryByText(/q2/)).toBeNull();
    });

    it('revokes and restores certificates, and reports a failure', async () => {
      const c = detail();
      await openApp('/kulapati/learners', { ...kulapati, console: c });
      fireEvent.click(await screen.findByText('Priya'));
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(await within(dialog).findByRole('button', { name: 'Revoke' }));
      await waitFor(() =>
        expect(c.service.revokeCertificate).toHaveBeenCalledWith({
          id: 'NSG-GIT-26-0001',
          revoked: true,
        }),
      );
      expect(await screen.findByText('Certificate revoked')).toBeTruthy();
      fireEvent.click(await within(dialog).findByRole('button', { name: 'Restore' }));
      await waitFor(() =>
        expect(c.service.revokeCertificate).toHaveBeenCalledWith({
          id: 'NSG-GIT-26-0002',
          revoked: false,
        }),
      );
      expect(await screen.findByText('Certificate restored')).toBeTruthy();
      c.service.revokeCertificate = vi.fn().mockRejectedValue(new Error('x'));
      fireEvent.click(await within(dialog).findByRole('button', { name: 'Revoke' }));
      expect(await screen.findByText('That did not work. Try again.')).toBeTruthy();
    });

    it('shows nothing to load for a pending invite, and closes with Escape', async () => {
      const c = detail();
      await openApp('/kulapati/learners', { ...kulapati, console: c });
      await screen.findByText('Priya');
      fireEvent.click(screen.getByRole('tab', { name: 'Pending invite (1)' }));
      fireEvent.click(await screen.findByText('new@nonstopio.com'));
      const dialog = await screen.findByRole('dialog');
      expect(await within(dialog).findByText('No activity yet.')).toBeTruthy();
      expect(within(dialog).getByText('None yet.')).toBeTruthy();
      expect(c.data.progressFor).toHaveBeenCalledTimes(1);
      fireEvent.keyDown(document, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(act).toBeDefined();
    });
  });
});
