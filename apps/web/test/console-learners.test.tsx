import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AssignmentFull, UserRow } from '../src/console/types';
import { log } from '../src/log';
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

  it('opens already filtered to the course in the address', async () => {
    const c = setup();
    await openApp('/kulapati/learners?course=git', { ...kulapati, console: c });
    await waitFor(() => expect(c.data.assignments).toHaveBeenCalledWith({ courseId: 'git' }));
    expect((screen.getByLabelText('Course') as HTMLSelectElement).value).toBe('git');
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

  describe('select all across pages', () => {
    const team = Array.from({ length: 26 }, (_, i) =>
      userRow(i + 100, { displayName: `T${i}`, team: 'QA' }),
    );
    const tickPage = () => fireEvent.click(screen.getByLabelText('Select all rows on this page'));

    it('selects everyone a filter matches and acts on all of them', async () => {
      const c = setup({ team });
      await openApp('/kulapati/learners', { ...kulapati, console: c });
      await screen.findByText('Priya');
      fireEvent.change(screen.getByLabelText('Team'), { target: { value: 'QA' } });
      await screen.findByText('T0');
      expect(screen.queryByRole('button', { name: /^Select all \d/ })).toBeNull();
      tickPage();
      expect(screen.getByText('25 selected')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Select all 26' }));
      expect(await screen.findByText('26 selected')).toBeTruthy();
      expect(screen.queryByRole('button', { name: /^Select all \d/ })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Send reminder' }));
      await waitFor(() => expect(c.service.remindLearners).toHaveBeenCalled());
      const sent = (c.service.remindLearners as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
        emails: string[];
      };
      expect(sent.emails).toHaveLength(26);
      fireEvent.click(screen.getByRole('button', { name: 'Change role' }));
      fireEvent.click(screen.getByRole('button', { name: 'Apply to 26 people' }));
      await waitFor(() => expect(c.service.setRoles).toHaveBeenCalledTimes(26));
      expect(await screen.findByText('Roles changed: 26, skipped: 0')).toBeTruthy();
      expect(screen.queryByText('26 selected')).toBeNull();
    });

    it('drops back to the ticked rows when one is unticked', async () => {
      await openApp('/kulapati/learners', { ...kulapati, console: setup({ team }) });
      await screen.findByText('Priya');
      fireEvent.change(screen.getByLabelText('Team'), { target: { value: 'QA' } });
      await screen.findByText('T0');
      tickPage();
      fireEvent.click(screen.getByRole('button', { name: 'Select all 26' }));
      await screen.findByText('26 selected');
      fireEvent.click(screen.getByLabelText('Select T0'));
      expect(screen.getByText('25 selected')).toBeTruthy();
      expect(screen.queryByRole('button', { name: /^Select all \d/ })).toBeNull();
    });

    it('reads every person by cursor on the unfiltered list, pending invites included', async () => {
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
      await screen.findByText('Person 0');
      tickPage();
      fireEvent.click(screen.getByRole('button', { name: 'Select all 31' }));
      expect(await screen.findByText('5 selected')).toBeTruthy();
      expect(c.data.usersPage).toHaveBeenCalledWith('cursor-1', 100);
      fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
      expect(screen.queryByText('5 selected')).toBeNull();
    });

    it('leaves out pending invites on "Signed in" and reads the pending tab from memory', async () => {
      const invited = Array.from({ length: 26 }, (_, i) => asg(`invite${i}@nonstopio.com`));
      const c = setup({ assignments: invited });
      await openApp('/kulapati/learners', { ...kulapati, console: c });
      await screen.findByText('Priya');
      fireEvent.click(screen.getByRole('tab', { name: 'Signed in (2)' }));
      await screen.findByText('Rohan');
      fireEvent.click(screen.getByRole('tab', { name: 'Pending invite (26)' }));
      await screen.findByText('invite0@nonstopio.com');
      tickPage();
      fireEvent.click(screen.getByRole('button', { name: 'Select all 26' }));
      expect(await screen.findByText('26 selected')).toBeTruthy();
    });

    it('selects the signed-in people only, and a course filter from memory', async () => {
      const signed = Array.from({ length: 26 }, (_, i) =>
        userRow(i + 200, { displayName: `S${i}` }),
      );
      const invited = Array.from({ length: 26 }, (_, i) => asg(`invite${i}@nonstopio.com`));
      const c = setup({ users: signed, count: 26, assignments: invited });
      c.data.usersPage = vi.fn(async (cursor: string | null) =>
        cursor === null
          ? { rows: signed.slice(0, 25), nextCursor: 'c' }
          : { rows: signed.slice(25), nextCursor: null },
      );
      await openApp('/kulapati/learners', { ...kulapati, console: c });
      await screen.findByText('S0');
      fireEvent.click(screen.getByRole('tab', { name: 'Signed in (26)' }));
      await screen.findByText('S0');
      tickPage();
      fireEvent.click(screen.getByRole('button', { name: 'Select all 26' }));
      expect(await screen.findByText('26 selected')).toBeTruthy();
      fireEvent.click(screen.getByRole('tab', { name: /^All \(/ }));
      fireEvent.change(screen.getByLabelText('Course'), { target: { value: 'git' } });
      await screen.findByText('invite0@nonstopio.com');
      tickPage();
      fireEvent.click(await screen.findByRole('button', { name: 'Select all 26' }));
      expect(await screen.findByText('26 selected')).toBeTruthy();
    });

    it('says so when the read fails, and a late read cannot select a changed view', async () => {
      const many = Array.from({ length: 3 }, (_, i) =>
        userRow(i + 10, { displayName: `Person ${i}` }),
      );
      const c = setup({ users: many, count: 30 });
      let calls = 0;
      let release: () => void = () => undefined;
      c.data.usersPage = vi.fn(async () => {
        calls += 1;
        if (calls === 2) throw Object.assign(new Error('x'), { code: 'unavailable' });
        if (calls >= 3) await new Promise<void>((r) => (release = r));
        return { rows: many, nextCursor: null };
      });
      await openApp('/kulapati/learners', { ...kulapati, console: c });
      await screen.findByText('Person 0');
      tickPage();
      fireEvent.click(screen.getByRole('button', { name: 'Select all 31' }));
      expect(await screen.findByText('Could not select everyone. Try again.')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Select all 31' }));
      fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
      await act(async () => release());
      await waitFor(() => expect(calls).toBeGreaterThanOrEqual(3));
      expect(screen.queryByText(/ selected$/)).toBeNull();
    });
  });

  it('runs the bulk actions: assign, remind and clear', async () => {
    const c = setup();
    const { router } = await openApp('/kulapati/learners', { ...kulapati, console: c });
    await screen.findByText('Priya');
    fireEvent.click(screen.getByLabelText('Select Priya'));
    fireEvent.click(screen.getByRole('button', { name: 'Send reminder' }));
    await waitFor(() =>
      expect(c.service.remindLearners).toHaveBeenCalledWith({ emails: ['user1@nonstopio.com'] }),
    );
    expect(await screen.findByText('Reminders sent: 1, skipped: 0')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByText('1 selected')).toBeNull();
    fireEvent.click(screen.getByLabelText('Select Priya'));
    fireEvent.click(screen.getByRole('button', { name: 'Assign course' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/kulapati/assign'));
    expect(router.state.location.state).toEqual({ emails: ['user1@nonstopio.com'] });
  });

  it('changes the role of everyone selected and skips pending invites', async () => {
    const c = setup();
    await openApp('/kulapati/learners', { ...kulapati, console: c });
    await screen.findByText('Priya');
    fireEvent.click(screen.getByLabelText('Select Rohan'));
    fireEvent.click(screen.getByLabelText('Select new@nonstopio.com'));
    fireEvent.click(screen.getByRole('button', { name: 'Change role' }));
    expect(screen.getByText(/Courses already granted stay/)).toBeTruthy();
    expect(screen.getByText(/1 will be skipped: pending invites.*your own/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Kulapati (admin)'));
    expect(
      screen.getByText(/1 will be skipped: pending invites have no account yet\./),
    ).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Shishya (learner)'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply to 1 person' }));
    await waitFor(() =>
      expect(c.service.setRoles).toHaveBeenCalledWith({
        uid: 'u2',
        acharya: false,
        kulapati: false,
        grantedCourseIds: [],
      }),
    );
    expect(await screen.findByText('Roles changed: 1, skipped: 1')).toBeTruthy();
    expect(screen.queryByText('2 selected')).toBeNull();
  });

  it('reports roles that could not be changed', async () => {
    const c = setup();
    c.service.setRoles = vi.fn().mockRejectedValue(new Error('no'));
    await openApp('/kulapati/learners', { ...kulapati, console: c });
    await screen.findByText('Priya');
    fireEvent.click(screen.getByLabelText('Select Rohan'));
    fireEvent.click(screen.getByRole('button', { name: 'Change role' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply to 1 person' }));
    expect(await screen.findByText('Roles changed: 0, skipped: 0, failed: 1')).toBeTruthy();
  });

  it('never lets you drop your own Kulapati role in a bulk change', async () => {
    await openApp('/kulapati/learners', { ...kulapati, console: setup() });
    await screen.findByText('Priya');
    fireEvent.click(screen.getByLabelText('Select Priya'));
    fireEvent.click(screen.getByRole('button', { name: 'Change role' }));
    expect(screen.getByRole('button', { name: 'Apply to 0 people' })).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Kulapati (admin)'));
    expect(screen.getByRole('button', { name: 'Apply to 1 person' })).toBeTruthy();
  });

  it('cannot apply a role change to nobody and can be closed', async () => {
    await openApp('/kulapati/learners', { ...kulapati, console: setup() });
    await screen.findByText('Priya');
    fireEvent.click(screen.getByRole('tab', { name: 'Pending invite (1)' }));
    fireEvent.click(await screen.findByLabelText('Select new@nonstopio.com'));
    fireEvent.click(screen.getByRole('button', { name: 'Change role' }));
    expect(
      (screen.getByRole('button', { name: 'Apply to 0 people' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
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

  describe('opened from global search', () => {
    function deferredUsers() {
      let resolve: (u: UserRow[]) => void = () => {};
      let reject: (e: unknown) => void = () => {};
      const promise = new Promise<UserRow[]>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    }

    it('opens the drawer of the person in the link, then drops it from the URL', async () => {
      const c = setup();
      const { router } = await openApp('/kulapati/learners?learner=u2', {
        ...kulapati,
        console: c,
      });
      const dialog = await screen.findByRole('dialog', { name: 'Rohan' });
      expect(within(dialog).getByText('user2@nonstopio.com')).toBeTruthy();
      expect(c.data.usersByUid).toHaveBeenCalledWith(['u2']);
      expect(router.state.location.search).toBe('');
      expect(router.state.location.pathname).toBe('/kulapati/learners');
    });

    it('says so when the person is not found, or cannot be read', async () => {
      const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
      const c = setup();
      const { router } = await openApp('/kulapati/learners?learner=gone', {
        ...kulapati,
        console: c,
      });
      expect(await screen.findByText('That person was not found.')).toBeTruthy();
      expect(screen.queryByRole('dialog')).toBeNull();
      c.data.usersByUid = vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('x'), { code: 'denied' }));
      await act(() => router.navigate('/kulapati/learners?learner=u1'));
      expect(await screen.findByText('Could not open that learner. Try again.')).toBeTruthy();
      expect(warn).toHaveBeenCalledWith('Linked learner not loaded', { code: 'denied' });
      warn.mockRestore();
    });

    it('opens only the newest link when an earlier read lands later', async () => {
      const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
      const c = setup();
      const first = deferredUsers();
      const second = deferredUsers();
      const third = deferredUsers();
      c.data.usersByUid = vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise)
        .mockReturnValueOnce(third.promise);
      const { router } = await openApp('/kulapati/learners?learner=u1', {
        ...kulapati,
        console: c,
      });
      await screen.findByText('Priya');
      await act(() => router.navigate('/kulapati/learners?learner=u9'));
      await act(() => router.navigate('/kulapati/learners?learner=u2'));
      await act(async () => third.resolve([users[1] as UserRow]));
      await act(async () => first.resolve([users[0] as UserRow]));
      await act(async () => second.reject(new Error('late')));
      expect(screen.getByRole('dialog', { name: 'Rohan' })).toBeTruthy();
      expect(screen.queryByText('Could not open that learner. Try again.')).toBeNull();
      warn.mockRestore();
    });
  });
});
