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

  it('counts pending invites and overdue people past the newest assignments', async () => {
    const old = new Date('2025-01-01T00:00:00Z');
    const c = setup({
      open: [
        asg('older@nonstopio.com', { assignedAt: old }),
        asg('user2@nonstopio.com', { uid: 'u2', dueAt: late, assignedAt: old }),
        asg('new@nonstopio.com'),
      ],
    });
    await openApp('/kulapati/learners', { ...kulapati, console: c });
    await screen.findByText('Priya');
    expect(c.data.openAssignments).toHaveBeenCalledWith(expect.any(Date));
    expect(screen.getByRole('tab', { name: 'All (4)' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Pending invite (2)' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Overdue (2)' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Pending invite (2)' }));
    expect(await screen.findByText('older@nonstopio.com')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Overdue (2)' }));
    expect(await screen.findByText('Rohan')).toBeTruthy();
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
    const soon = new Date(Date.now() + 10 * 86_400_000);
    const detail = () => {
      const c = setup({
        assignments: [
          ...assignments,
          asg('user1@nonstopio.com', {
            uid: 'u1',
            courseId: 'docker',
            dueAt: soon,
            mandatory: true,
          }),
          asg('user1@nonstopio.com', { uid: 'u1', courseId: 'k8s', status: 'completed' }),
          asg('new@nonstopio.com', { courseId: 'docker', dueAt: soon }),
        ],
      });
      c.data.progressFor = vi.fn().mockResolvedValue([
        {
          ...progressRow({
            courseId: 'git',
            percent: 40,
            pariksha: {
              q1: { best: 0.5, passed: false, attempts: 2, lastAttemptAt: null },
              q2: { best: 0, passed: false, attempts: 0, lastAttemptAt: null },
              gone: { best: 1, passed: true, attempts: 1, lastAttemptAt: null },
            },
          }),
          uid: 'u1',
        },
        { ...progressRow({ courseId: 'unknown-course', percent: 10 }), uid: 'u1' },
      ]);
      c.data.attemptsFor = vi.fn(async (_uid: string, _courseId: string, parikshaId: string) =>
        parikshaId === 'q1'
          ? [
              {
                id: 'a2',
                parikshaId,
                score: 0.5,
                passed: false,
                at: new Date('2026-03-04T00:00:00Z'),
              },
              { id: 'a1', parikshaId, score: 0.25, passed: false, at: null },
            ]
          : [{ id: 'a3', parikshaId, score: 1, passed: true, at: null }],
      );
      c.data.certificatesFor = vi
        .fn()
        .mockResolvedValue([
          certificateRow(),
          certificateRow({ id: 'NSG-GIT-26-0002', revoked: true }),
        ]);
      return c;
    };

    const openPriya = async (c: ReturnType<typeof detail>) => {
      await openApp('/kulapati/learners', { ...kulapati, console: c });
      fireEvent.click(await screen.findByText('Priya'));
      const dialog = await screen.findByRole('dialog');
      await within(dialog).findByText('Certificates');
      return dialog;
    };

    it('lists every assigned course, started or not, with due dates and status', async () => {
      const c = detail();
      const dialog = await openPriya(c);
      expect(c.data.assignmentsFor).toHaveBeenCalledWith('user1@nonstopio.com');
      const items = within(dialog)
        .getAllByRole('listitem')
        .filter((li) => li.classList.contains('drawer-course'))
        .map((li) => li.textContent ?? '');
      expect(items).toHaveLength(4);
      expect(items[0]).toMatch(/^Git, the NonStop Way.*Overdue/);
      expect(items[1]).toMatch(/^docker.*Not started.*Due .* · Mandatory/);
      expect(items[2]).toMatch(/^k8s.*Completed.*No due date/);
      expect(items[3]).toMatch(/^unknown-course.*In progress.*Not assigned/);
      expect(within(dialog).queryByRole('progressbar', { name: 'docker progress' })).toBeNull();
      expect(
        within(dialog).getByRole('progressbar', { name: 'Git, the NonStop Way progress' }),
      ).toBeTruthy();
    });

    it('shows Pariksha attempts by title, newest first, and resets a cooldown', async () => {
      const c = detail();
      const dialog = await openPriya(c);
      const q1 = within(dialog).getByRole('region', { name: 'Pariksha I attempts' });
      expect(q1.textContent).toContain('Pariksha I · 2 attempts · best 50% · Not passed yet');
      expect(
        within(q1)
          .getAllByRole('listitem')
          .map((li) => li.textContent),
      ).toEqual(['4 March 2026: 50%, not passed', 'Date unknown: 25%, not passed']);
      const gone = within(dialog).getByRole('region', { name: 'gone attempts' });
      expect(gone.textContent).toContain('gone · 1 attempt · best 100% · Passed');
      expect(within(gone).getByText('Date unknown: 100%, passed')).toBeTruthy();
      expect(within(dialog).queryByText(/q1|q2/)).toBeNull();
      expect(c.data.attemptsFor).toHaveBeenCalledWith('u1', 'git', 'q1');
      expect(c.data.attemptsFor).toHaveBeenCalledTimes(2);
      fireEvent.click(within(q1).getByRole('button', { name: 'Reset cooldown for Pariksha I' }));
      await waitFor(() =>
        expect(c.service.resetCooldown).toHaveBeenCalledWith({
          uid: 'u1',
          courseId: 'git',
          parikshaId: 'q1',
        }),
      );
      expect(await screen.findByText('Retake opened')).toBeTruthy();
      await waitFor(() => expect(c.data.attemptsFor).toHaveBeenCalledTimes(4));
    });

    it('asks before revoking a certificate, restores without asking, and reports a failure', async () => {
      const c = detail();
      const dialog = await openPriya(c);
      fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke' }));
      const confirm = within(dialog).getByRole('group', {
        name: 'Confirm revoking NSG-GIT-26-0001',
      });
      fireEvent.click(within(confirm).getByRole('button', { name: 'Keep it' }));
      expect(within(dialog).queryByRole('group')).toBeNull();
      expect(c.service.revokeCertificate).not.toHaveBeenCalled();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke' }));
      fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke certificate' }));
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
      fireEvent.click(await within(dialog).findByRole('button', { name: 'Restore' }));
      expect(await screen.findByText('That did not work. Try again.')).toBeTruthy();
    });

    it('shows a pending invite’s assignments without reading progress, and closes with Escape', async () => {
      const c = detail();
      const { container } = await openApp('/kulapati/learners', { ...kulapati, console: c });
      await screen.findByText('Priya');
      fireEvent.click(screen.getByRole('tab', { name: 'Pending invite (1)' }));
      fireEvent.click(await screen.findByText('new@nonstopio.com'));
      const dialog = await screen.findByRole('dialog');
      expect(
        await within(dialog).findByText(/Pending invite: they have not signed in/),
      ).toBeTruthy();
      expect(within(dialog).getByText('Git, the NonStop Way')).toBeTruthy();
      expect(within(dialog).getAllByText('Not started')).toHaveLength(2);
      expect(within(dialog).getByText('None yet.')).toBeTruthy();
      expect(c.data.progressFor).toHaveBeenCalledTimes(1);
      expect(c.data.certificatesFor).not.toHaveBeenCalled();
      expect(c.data.attemptsFor).not.toHaveBeenCalled();
      expect(await axeViolations(container)).toEqual([]);
      fireEvent.keyDown(document, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(act).toBeDefined();
    });

    it('says so when a person has no courses at all', async () => {
      const c = setup({ assignments: [] });
      await openApp('/kulapati/learners', { ...kulapati, console: c });
      fireEvent.click(await screen.findByText('Rohan'));
      const dialog = await screen.findByRole('dialog');
      expect(await within(dialog).findByText('No courses assigned or started.')).toBeTruthy();
    });
  });
});
