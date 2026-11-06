import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ErrorCodeKey, Team } from '@gurukul/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TeamReport } from '../src/console/types';
import { dueDay } from '../src/console/model';
import { dayInput, endOfDay } from '../src/team/model';
import { axeViolations } from './axe';
import { fakeConsole } from './fake-console';
import { fakeData, makeCourse } from './fake-data';
import { openApp } from './harness';
import { choose } from './select';
import { apiFailure } from './studio-fixtures';

const ME = 'priya@nonstopio.com';
const manager = { roles: ['manager'] as Array<'manager'> };
const admin = { roles: ['admin'] as Array<'admin'> };
const web: Team = {
  id: 'web',
  name: 'Web',
  memberEmails: ['a@nonstopio.com', 'b@nonstopio.com'],
  createdAt: 5,
  createdBy: 'u9',
  managerEmails: [ME],
};
const candidates: Team = {
  id: 'educator-candidates',
  name: 'Educator candidates',
  memberEmails: ['c@nonstopio.com'],
  createdAt: 3,
  managerEmails: [ME],
};
const others: Team = { ...web, id: 'ops', name: 'Ops', managerEmails: ['x@nonstopio.com'] };
const bare: Team = { id: 'old', name: 'Old', memberEmails: [], createdAt: 0 };

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 10, 6);

const apiError = (code: ErrorCodeKey) => apiFailure(code);

const report = (over: Partial<TeamReport> = {}): TeamReport => ({
  teamId: 'web',
  name: 'Web',
  members: [
    {
      email: 'a@nonstopio.com',
      uid: 'ua',
      displayName: 'Asha Rao',
      assignments: [
        {
          assignmentId: 'a-git',
          courseId: 'git',
          courseTitle: 'Git basics',
          status: 'started',
          dueAt: NOW + 3 * DAY,
          percent: 40,
          teamId: 'web',
        },
        {
          assignmentId: 'a-sql',
          courseId: 'sql',
          courseTitle: 'SQL basics',
          status: 'completed',
          dueAt: null,
          percent: 100,
          teamId: 'web',
        },
      ],
    },
    {
      email: 'b@nonstopio.com',
      uid: null,
      displayName: null,
      assignments: [
        {
          assignmentId: 'b-git',
          courseId: 'git',
          courseTitle: 'Git basics',
          status: 'assigned',
          dueAt: NOW - 2 * DAY,
          percent: 0,
          teamId: null,
        },
      ],
    },
    { email: 'c@nonstopio.com', uid: 'uc', displayName: 'Chen', assignments: [] },
  ],
  ...over,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the Team area', () => {
  it('is open to Managers and Admins, and closed to a Learner and an Educator', async () => {
    const { unmount } = await openApp('/team', { console: fakeConsole() });
    expect(await screen.findByRole('heading', { name: /do not have access/ })).toBeTruthy();
    unmount();
    const second = await openApp('/team/web', { roles: ['educator'], console: fakeConsole() });
    expect(await screen.findByRole('heading', { name: /do not have access/ })).toBeTruthy();
    second.unmount();
    await openApp('/team', { ...manager, console: fakeConsole() });
    expect(await screen.findByRole('heading', { level: 1, name: 'My teams' })).toBeTruthy();
  });

  it('shows a Manager Learn and Team in the switcher, and names their role', async () => {
    await openApp('/team', { ...manager, console: fakeConsole() });
    const areas = await screen.findByRole('navigation', { name: 'Areas' });
    const links = within(areas).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Learn', 'Team']);
    expect(links.map((l) => l.getAttribute('aria-current'))).toEqual([null, 'page']);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'My teams' })).toBeTruthy();
    expect(within(nav).getByRole('link', { name: 'Assign to my teams' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Account:/ }));
    expect(screen.getByRole('menu').textContent).toContain('Manager');
  });
});

describe('My teams', () => {
  it('lists the teams a Manager manages, read by their email, with member counts', async () => {
    const c = fakeConsole({ teamList: [web, others] });
    const { container } = await openApp('/team', { ...manager, console: c });
    const table = await screen.findByRole('table', { name: 'My teams' });
    expect(c.data.managedTeams).toHaveBeenCalledWith(ME);
    expect(c.data.teamList).not.toHaveBeenCalled();
    expect(within(table).getByRole('link', { name: 'Web' }).getAttribute('href')).toBe('/team/web');
    expect(within(table).getByText('2 members')).toBeTruthy();
    expect(within(table).queryByText('Ops')).toBeNull();
    expect(screen.getByText(/The teams you manage/)).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('shows an Admin every team that has a document', async () => {
    const c = fakeConsole({ teamList: [web, others, bare] });
    await openApp('/team', { ...admin, console: c });
    const table = await screen.findByRole('table', { name: 'My teams' });
    expect(within(table).getByText('Ops')).toBeTruthy();
    expect(within(table).queryByText('Old')).toBeNull();
    expect(c.data.managedTeams).not.toHaveBeenCalled();
    expect(screen.getByText(/Every team, since you are one of the Admins/)).toBeTruthy();
  });

  it('pages 25 teams at a time', async () => {
    const many = Array.from({ length: 27 }, (_, i) => ({
      ...web,
      id: `t${i}`,
      name: `Team ${String(i).padStart(2, '0')}`,
    }));
    await openApp('/team', { ...manager, console: fakeConsole({ managed: many }) });
    expect(await screen.findByText('Team 00')).toBeTruthy();
    expect(screen.getByText('Showing 1–25 of 27')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Team 26')).toBeTruthy();
  });

  it('says when there are no teams yet, and offers to create one', async () => {
    await openApp('/team', { ...manager, console: fakeConsole() });
    expect(await screen.findByText('No teams yet')).toBeTruthy();
    expect(screen.getByText(/ask an Admin to name you on one/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Create team' })).toHaveLength(2);
    expect(screen.queryByRole('navigation', { name: 'Teams' })).toBeNull();
  });

  it('gives an Admin with no teams its own empty sentence', async () => {
    await openApp('/team', { ...admin, console: fakeConsole() });
    expect(await screen.findByText(/Create a team, then assign it courses/)).toBeTruthy();
  });

  it('says the list did not load, and reads again on Retry', async () => {
    const c = fakeConsole({ managed: [web] });
    vi.mocked(c.data.managedTeams).mockRejectedValueOnce(new Error('offline'));
    await openApp('/team', { ...manager, console: c });
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Web')).toBeTruthy();
  });

  it('creates a team managed by me, without reading it first', async () => {
    const c = fakeConsole({ managed: [web] });
    await openApp('/team', { ...manager, console: c });
    await screen.findByText('Web');
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
    const dialog = screen.getByRole('dialog', { name: 'Create team' });
    expect(within(dialog).queryByRole('combobox', { name: 'Managers' })).toBeNull();
    fireEvent.change(within(dialog).getByLabelText('Team name'), { target: { value: 'Mobile' } });
    fireEvent.paste(within(dialog).getByRole('combobox', { name: 'Members' }), {
      clipboardData: { getData: () => 'm@nonstopio.com' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create team' }));
    await waitFor(() => expect(c.data.saveTeam).toHaveBeenCalled());
    const [saved, previous, options] = vi.mocked(c.data.saveTeam).mock.calls[0] as [
      Team,
      string | null,
      { checkTaken: boolean },
    ];
    expect(saved).toMatchObject({
      id: 'mobile',
      memberEmails: ['m@nonstopio.com'],
      createdBy: 'u1',
      managerEmails: [ME],
    });
    expect(previous).toBeNull();
    expect(options).toEqual({ checkTaken: false });
    expect(await screen.findByText('Created Mobile')).toBeTruthy();
    await waitFor(() => expect(c.data.managedTeams).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('edits a team’s name and members, keeping its managers, but not the Educator team', async () => {
    const c = fakeConsole({ managed: [candidates, web] });
    await openApp('/team', { ...manager, console: c });
    expect(await screen.findByText('Educator candidates')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit Educator candidates' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Web' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit Web' });
    fireEvent.change(within(dialog).getByLabelText('Team name'), { target: { value: 'Web app' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save team' }));
    await waitFor(() => expect(c.data.saveTeam).toHaveBeenCalled());
    expect(vi.mocked(c.data.saveTeam).mock.calls[0]).toEqual([
      { ...web, name: 'Web app' },
      'Web',
      { checkTaken: false },
    ]);
  });

  it('lets an Admin edit the Educator team here, and reads before creating', async () => {
    const c = fakeConsole({ teamList: [candidates] });
    await openApp('/team', { ...admin, console: c });
    expect(await screen.findByRole('button', { name: 'Edit Educator candidates' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
    const dialog = screen.getByRole('dialog', { name: 'Create team' });
    fireEvent.change(within(dialog).getByLabelText('Team name'), { target: { value: 'Data' } });
    fireEvent.paste(within(dialog).getByRole('combobox', { name: 'Members' }), {
      clipboardData: { getData: () => 'd@nonstopio.com' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create team' }));
    await waitFor(() => expect(c.data.saveTeam).toHaveBeenCalled());
    expect(vi.mocked(c.data.saveTeam).mock.calls[0]?.[2]).toEqual({ checkTaken: true });
  });
});

describe('Team report', () => {
  const at = (
    path = '/team/web',
    over: Parameters<typeof fakeConsole>[0] = {},
    roles: { roles: Array<'manager' | 'admin'> } = manager,
  ) => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const c = fakeConsole({ report: report(), ...over });
    return openApp(path, { ...roles, console: c }).then((v) => ({ ...v, c }));
  };
  const rows = async () =>
    within(await screen.findByRole('table', { name: 'Web: members and their courses' }))
      .getAllByRole('row')
      .slice(1)
      .map((r) => r.textContent);

  it('lists members and their courses, overdue first, with counts and a way back', async () => {
    const { container, c } = await at();
    expect(await screen.findByRole('heading', { level: 1, name: 'Web' })).toBeTruthy();
    expect(c.service.teamReport).toHaveBeenCalledWith({ teamId: 'web' });
    expect(await rows()).toEqual([
      `b@nonstopio.comGit basicsOverdue${dueDay(NOW - 2 * DAY)}0%`,
      `Asha Raoa@nonstopio.comGit basicsIn progress${dueDay(NOW + 3 * DAY)}40%`,
      'Asha Raoa@nonstopio.comSQL basicsCompletedNo due date100%',
      'Chenc@nonstopio.comNo courses assigned',
    ]);
    const stat = (label: string) =>
      (screen.getByText(label, { selector: 'dt' }).nextElementSibling as HTMLElement).textContent;
    expect(stat('Members')).toBe('3');
    expect(stat('Overdue')).toBe('1');
    expect(stat('Completed')).toBe('1 of 3');
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'My teams' }).getAttribute('href')).toBe(
      '/team',
    );
    expect(screen.getByRole('link', { name: 'Assign courses' }).getAttribute('href')).toBe(
      '/team/assign',
    );
    expect(await axeViolations(container)).toEqual([]);
  });

  it('offers a Manager actions only on what was assigned through this team; an Admin on all', async () => {
    const { unmount } = await at();
    await rows();
    expect(screen.getAllByRole('button', { name: /^Change due date of/ })).toHaveLength(2);
    expect(
      screen.queryByRole('button', { name: 'Remove Git basics from b@nonstopio.com' }),
    ).toBeNull();
    unmount();
    await at('/team/web', {}, admin);
    await rows();
    expect(screen.getAllByRole('button', { name: /^Remove .* from / })).toHaveLength(3);
  });

  it('changes a due date, to a day or to none, and refuses a past one', async () => {
    const { c } = await at();
    await rows();
    fireEvent.click(
      screen.getByRole('button', { name: 'Change due date of Git basics for Asha Rao' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Change due date' });
    const field = within(dialog).getByLabelText('Due date') as HTMLInputElement;
    expect(field.value).toBe(dayInput(NOW + 3 * DAY));
    fireEvent.change(field, { target: { value: dayInput(NOW - DAY) } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save due date' }));
    expect(await within(dialog).findByText('The due date cannot be in the past.')).toBeTruthy();
    const day = dayInput(NOW + 10 * DAY);
    fireEvent.change(field, { target: { value: day } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save due date' }));
    await waitFor(() =>
      expect(c.service.updateAssignment).toHaveBeenCalledWith({
        assignmentId: 'a-git',
        dueAt: endOfDay(day),
      }),
    );
    expect(await screen.findByText(`Git basics is due ${dueDay(endOfDay(day))}`)).toBeTruthy();
    await waitFor(() => expect(c.service.teamReport).toHaveBeenCalledTimes(2));

    fireEvent.click(
      await screen.findByRole('button', { name: 'Change due date of SQL basics for Asha Rao' }),
    );
    const again = screen.getByRole('dialog', { name: 'Change due date' });
    expect((within(again).getByLabelText('Due date') as HTMLInputElement).value).toBe('');
    fireEvent.click(within(again).getByRole('button', { name: 'Save due date' }));
    await waitFor(() =>
      expect(c.service.updateAssignment).toHaveBeenLastCalledWith({
        assignmentId: 'a-sql',
        dueAt: null,
      }),
    );
    expect(await screen.findByText('SQL basics has no due date now')).toBeTruthy();
  });

  it('keeps the due date dialog open when the change fails, and Cancel closes it', async () => {
    const { c } = await at();
    vi.mocked(c.service.updateAssignment).mockRejectedValueOnce(apiError('AUTH_2001'));
    await rows();
    fireEvent.click(
      screen.getByRole('button', { name: 'Change due date of Git basics for Asha Rao' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Change due date' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save due date' }));
    expect(await screen.findByRole('dialog', { name: 'Change due date' })).toBeTruthy();
    await waitFor(() => expect(c.service.updateAssignment).toHaveBeenCalled());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(c.service.teamReport).toHaveBeenCalledTimes(1);
  });

  it('removes an assignment after asking, and keeps it when that fails', async () => {
    const { c } = await at();
    vi.mocked(c.service.removeAssignment).mockRejectedValueOnce(new Error('offline'));
    await rows();
    const open = () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove Git basics from Asha Rao' }));
      return screen.getByRole('dialog', { name: 'Remove Git basics?' });
    };
    fireEvent.click(within(open()).getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(open(), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    let dialog = open();
    expect(within(dialog).getByText(/Asha Rao no longer has to take it/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove course' }));
    expect(await screen.findByText('Could not remove the course. Try again.')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Remove Git basics?' })).toBeTruthy();
    dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove course' }));
    await waitFor(() =>
      expect(c.service.removeAssignment).toHaveBeenLastCalledWith({ assignmentId: 'a-git' }),
    );
    expect(await screen.findByText('Removed Git basics from Asha Rao')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(c.service.teamReport).toHaveBeenCalledTimes(2);
  });

  it('reminds the team about everything, or one course, and says how many', async () => {
    const { c } = await at();
    await rows();
    fireEvent.click(screen.getByRole('button', { name: 'Remind team' }));
    let dialog = screen.getByRole('dialog', { name: 'Remind Web' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send reminders' }));
    await waitFor(() => expect(c.service.remindLearners).toHaveBeenCalledWith({ teamId: 'web' }));
    expect(await screen.findByText('Reminded 1 person')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    vi.mocked(c.service.remindLearners).mockResolvedValueOnce({ sent: 2, skipped: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Remind team' }));
    dialog = screen.getByRole('dialog', { name: 'Remind Web' });
    await choose(within(dialog).getByRole('combobox', { name: 'About' }), 'SQL basics');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send reminders' }));
    await waitFor(() =>
      expect(c.service.remindLearners).toHaveBeenLastCalledWith({ teamId: 'web', courseId: 'sql' }),
    );
    expect(
      await screen.findByText('Reminded 2 people, skipped 1 reminded in the last day'),
    ).toBeTruthy();
  });

  it('keeps the remind dialog open when sending fails, and Cancel closes it', async () => {
    const { c } = await at();
    vi.mocked(c.service.remindLearners).mockRejectedValueOnce(new Error('offline'));
    await rows();
    fireEvent.click(screen.getByRole('button', { name: 'Remind team' }));
    const dialog = screen.getByRole('dialog', { name: 'Remind Web' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send reminders' }));
    expect(await screen.findByText('Could not send the reminders. Try again.')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('has nothing to remind when every course is finished, and says when nobody is on the team', async () => {
    const { unmount } = await at('/team/web', {
      report: report({
        members: [{ email: 'c@nonstopio.com', uid: 'uc', displayName: 'Chen', assignments: [] }],
      }),
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Web' })).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Remind team' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    unmount();
    await at('/team/web', { report: report({ members: [] }) });
    expect(await screen.findByText('Nobody on this team yet')).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Report' })).toBeNull();
  });

  it('pages 25 rows at a time', async () => {
    const members = Array.from({ length: 27 }, (_, i) => ({
      email: `p${String(i).padStart(2, '0')}@nonstopio.com`,
      uid: null,
      displayName: null,
      assignments: [],
    }));
    await at('/team/web', { report: report({ members }) });
    expect(await screen.findByText('p00@nonstopio.com')).toBeTruthy();
    expect(screen.getByText('Showing 1–25 of 27')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('p26@nonstopio.com')).toBeTruthy();
  });

  it('says plainly when the team is not one you manage, or does not exist', async () => {
    for (const code of ['AUTH_2001', 'VAL_1003'] as const) {
      const c = fakeConsole();
      vi.mocked(c.service.teamReport).mockRejectedValueOnce(apiError(code));
      const { unmount } = await openApp('/team/ops', { ...manager, console: c });
      expect(
        await screen.findByRole('heading', { level: 1, name: 'This team is not one you manage' }),
      ).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Go to My teams' }).getAttribute('href')).toBe(
        '/team',
      );
      unmount();
    }
  });

  it('offers Retry on any other failure, and loads again', async () => {
    const c = fakeConsole({ report: report() });
    vi.mocked(c.service.teamReport)
      .mockRejectedValueOnce(apiError('GEN_5000'))
      .mockRejectedValueOnce(new Error('offline'));
    await openApp('/team/web', { ...manager, console: c });
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Web' })).toBeTruthy();
  });
});

describe('Assign to my teams', () => {
  const staffOnly = makeCourse({ id: 'secret', title: 'Staff only' });
  const educatorCourse = makeCourse({ id: 'educator-onboarding', title: 'Becoming an Educator' });
  const open = (
    c = fakeConsole({ managed: [web, others] }),
    roles: { roles: Array<'manager' | 'admin'> } = manager,
    state?: object,
  ) =>
    openApp(state ? { pathname: '/team/assign', state } : '/team/assign', {
      ...roles,
      console: c,
      data: fakeData({
        courses: [
          makeCourse(),
          { ...staffOnly, visibility: 'staff' } as typeof staffOnly,
          educatorCourse,
        ],
      }),
    }).then((v) => ({ ...v, c }));
  const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }));

  it('offers only assignable courses and my teams, and sends the teams’ ids', async () => {
    const { c, container } = await open();
    expect(await screen.findByLabelText(/Git, the NonStop Way/)).toBeTruthy();
    expect(screen.queryByLabelText(/Staff only/)).toBeNull();
    expect(screen.queryByLabelText(/Becoming an Educator/)).toBeNull();
    fireEvent.click(screen.getByLabelText(/Git, the NonStop Way/));
    next();
    expect(await screen.findByRole('heading', { level: 2, name: 'Who is it for?' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Assign to' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New team' })).toBeNull();
    fireEvent.click(screen.getByLabelText('Web'));
    expect(await screen.findByText('2 people will be assigned. From 1 team: Web.')).toBeTruthy();
    expect(c.data.usersInTeam).not.toHaveBeenCalled();
    expect(c.data.knownEmails).toHaveBeenLastCalledWith(['a@nonstopio.com', 'b@nonstopio.com'], []);
    next();
    next();
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Review and assign' }),
    ).toBeTruthy();
    expect(screen.queryByText('Already assigned')).toBeNull();
    expect(screen.getByText(/they are counted as already assigned once you assign/)).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Assign to 2 people' }));
    await waitFor(() => expect(c.service.assignCourses).toHaveBeenCalled());
    const sent = vi.mocked(c.service.assignCourses).mock.calls[0]?.[0];
    expect(sent).toMatchObject({ courseIds: ['git'], teamIds: ['web'] });
    expect(sent).not.toHaveProperty('emails');
    const link = await screen.findByRole('link', { name: 'View team report' });
    expect(link.getAttribute('href')).toBe('/team/web');
  });

  it('starts with the team the report handed over, and ends at My teams for two', async () => {
    const { c } = await open(undefined, manager, { teamNames: ['Web', 'Gone'] });
    fireEvent.click(await screen.findByLabelText(/Git, the NonStop Way/));
    next();
    expect(await screen.findByText('2 people will be assigned. From 1 team: Web.')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Ops'));
    expect(
      await screen.findByText('2 people will be assigned. From 2 teams: Web, Ops.'),
    ).toBeTruthy();
    next();
    next();
    fireEvent.click(await screen.findByRole('button', { name: 'Assign to 2 people' }));
    await waitFor(() =>
      expect(c.service.assignCourses).toHaveBeenCalledWith(
        expect.objectContaining({ teamIds: ['web', 'ops'] }),
      ),
    );
    expect((await screen.findByRole('link', { name: 'View my teams' })).getAttribute('href')).toBe(
      '/team',
    );
  });

  it('re-sends the teams for the courses that failed', async () => {
    const c = fakeConsole({ managed: [web] });
    vi.mocked(c.service.assignCourses)
      .mockResolvedValueOnce({
        summary: { signedIn: 2, newInvites: 0, alreadyAssigned: 0, rejected: [] },
        assigned: 1,
        notified: 0,
        failed: [{ email: 'b@nonstopio.com', courseId: 'git' }],
      })
      .mockResolvedValueOnce({
        summary: { signedIn: 1, newInvites: 0, alreadyAssigned: 1, rejected: [] },
        assigned: 1,
        notified: 0,
        failed: [],
      });
    await open(c);
    fireEvent.click(await screen.findByLabelText(/Git, the NonStop Way/));
    next();
    fireEvent.click(await screen.findByLabelText('Web'));
    await screen.findByText(/2 people will be assigned/);
    next();
    next();
    fireEvent.click(await screen.findByRole('button', { name: 'Assign to 2 people' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(c.service.assignCourses).toHaveBeenCalledTimes(2));
    expect(vi.mocked(c.service.assignCourses).mock.calls[1]?.[0]).toMatchObject({
      courseIds: ['git'],
      teamIds: ['web'],
    });
  });

  it('says there are no teams to pick, and no courses to assign', async () => {
    await openApp('/team/assign', {
      ...manager,
      console: fakeConsole(),
      data: fakeData({ courses: [] }),
    });
    expect(await screen.findByText(/Courses you can assign appear here/)).toBeTruthy();
  });

  it('tells a Manager with no teams where to make one', async () => {
    await open(fakeConsole());
    fireEvent.click(await screen.findByLabelText(/Git, the NonStop Way/));
    next();
    expect(await screen.findByText('Create a team on My teams, then pick it here.')).toBeTruthy();
  });

  it('lets an Admin pick any team here, and still counts who already has a course', async () => {
    const { c } = await open(fakeConsole({ teamList: [web, others, bare] }), admin);
    fireEvent.click(await screen.findByLabelText(/Git, the NonStop Way/));
    next();
    fireEvent.click(await screen.findByLabelText('Ops'));
    await screen.findByText(/From 1 team: Ops/);
    expect(screen.queryByLabelText('Old')).toBeNull();
    expect(c.data.knownEmails).toHaveBeenLastCalledWith(
      ['a@nonstopio.com', 'b@nonstopio.com'],
      ['git'],
    );
  });
});
