import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AssignmentFull, AuditRow } from '../src/console/types';
import { axeViolations } from './axe';
import { fakeConsole, userRow } from './fake-console';
import { fakeData, makeCourse, progressRow } from './fake-data';
import { openApp } from './harness';

const adminCaller = { roles: ['admin'] as Array<'admin'> };
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
const past = new Date(Date.now() - 5 * 86_400_000);

describe('console access', () => {
  it('shows not-allowed to a Learner on every console page', async () => {
    for (const path of [
      '/admin',
      '/admin/learners',
      '/admin/assign',
      '/admin/roles',
      '/admin/audit',
      '/admin/settings',
      '/admin/courses/git',
    ]) {
      const { unmount } = await openApp(path);
      expect(await screen.findByRole('heading', { name: /do not have access/ })).toBeTruthy();
      unmount();
    }
  });

  it('lists the console in the sidebar for an Admin', async () => {
    await openApp('/admin', { ...adminCaller });
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    for (const name of [
      'Overview',
      'Learners',
      'Assign courses',
      'Roles & access',
      'Org settings',
    ]) {
      expect(within(nav).getByRole('link', { name })).toBeTruthy();
    }
  });
});

describe('Overview', () => {
  it('shows dashes and empty states for an empty organisation', async () => {
    await openApp('/admin', { ...adminCaller, data: fakeData({ courses: [] }) });
    expect(await screen.findByText('No learners yet')).toBeTruthy();
    expect(screen.getByText('No attempts yet')).toBeTruthy();
    expect(screen.getByText('0 of 0 first attempts')).toBeTruthy();
    expect(screen.getByText('No activity yet')).toBeTruthy();
    expect(screen.getByText('No courses yet')).toBeTruthy();
  });

  it('shows the figures from the counters, the weekly chart and the course funnel', async () => {
    const week = (() => {
      const d = new Date();
      const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      const day = t.getUTCDay() || 7;
      t.setUTCDate(t.getUTCDate() + 4 - day);
      const start = Date.UTC(t.getUTCFullYear(), 0, 1);
      return `${t.getUTCFullYear()}-W${String(Math.ceil(((t.getTime() - start) / 86_400_000 + 1) / 7)).padStart(2, '0')}`;
    })();
    const c = fakeConsole({
      org: {
        usersTotal: 20,
        activeLearners30d: 12,
        assignmentsTotal: 10,
        assignmentsCompleted: 4,
        quizScoreSum: 5.4,
        quizScoreCount: 8,
        quizFirstTryTotal: 6,
        quizFirstTryPassed: 3,
        weekly: { [week]: 9 },
      },
      course: { assigned: 10, started: 8, completed: 4, scoreSum: 3.2, scoreCount: 4 },
      assignments: [asg('a@nonstopio.com', { dueAt: past }), asg('b@nonstopio.com', { uid: 'u2' })],
    });
    const { container } = await openApp('/admin', { ...adminCaller, console: c });
    expect(await screen.findByText('12')).toBeTruthy();
    expect(screen.getByText('40%')).toBeTruthy();
    expect(screen.getByText('4 of 10')).toBeTruthy();
    expect(screen.getByRole('img', { name: /Lessons completed per week/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Git, the NonStop Way' }).getAttribute('href')).toBe(
      '/admin/courses/git',
    );
    expect(screen.getByText('4 (40%)')).toBeTruthy();
    expect(screen.getByText('80%')).toBeTruthy();
    expect(screen.getByText('68%')).toBeTruthy();
    expect(screen.getByText('Over 8 graded attempts')).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy();
    expect(screen.getByText('3 of 6 first attempts')).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('counts overdue assignments past the newest ones the page loads', async () => {
    const c = fakeConsole({
      assignments: [],
      open: Array.from({ length: 3 }, (_, i) => asg(`o${i}@nonstopio.com`, { dueAt: past })),
    });
    await openApp('/admin', { ...adminCaller, console: c });
    const card = (await screen.findByText('Overdue assignments')).parentElement as HTMLElement;
    expect(within(card).getByText('3')).toBeTruthy();
    expect(c.data.overdueCount).toHaveBeenCalledTimes(1);
  });

  it('counts pending invites past the newest ones the page loads, once per email', async () => {
    const c = fakeConsole({
      assignments: [],
      open: [
        asg('p1@nonstopio.com', { uid: null }),
        asg('p1@nonstopio.com', { uid: null, courseId: 'other' }),
        asg('p2@nonstopio.com', { uid: null }),
        asg('o@nonstopio.com', { uid: 'u9', dueAt: past }),
      ],
    });
    await openApp('/admin', { ...adminCaller, console: c });
    const card = (await screen.findByText('Pending invites')).parentElement as HTMLElement;
    expect(within(card).getByText('2')).toBeTruthy();
    expect(c.data.openAssignments).toHaveBeenCalledWith(expect.any(Date));
  });

  it('shows dashes for a course nobody has started', async () => {
    await openApp('/admin', { ...adminCaller });
    expect(await screen.findByRole('link', { name: 'Git, the NonStop Way' })).toBeTruthy();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});

describe('Overview CSV export', () => {
  it('saves every assignment as a CSV file', async () => {
    const create = vi.fn(() => 'blob:csv');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const c = fakeConsole({ assignments: [asg('a@nonstopio.com')] });
    await openApp('/admin', { ...adminCaller, console: c });
    const button = (await screen.findByRole('button', {
      name: 'Export CSV',
    })) as HTMLButtonElement;
    // The button is on screen, disabled, before the assignments load.
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    expect(create).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:csv');
    click.mockRestore();
  });

  it('disables the export while nobody is assigned', async () => {
    await openApp('/admin', { ...adminCaller });
    const button = await screen.findByRole('button', { name: 'Export CSV' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Audit log', () => {
  it('lists the newest actions with who did them', async () => {
    const c = fakeConsole({
      audit: [
        {
          id: 'a1',
          action: 'roles.set',
          by: 'boss@nonstopio.com',
          target: 'Dev Rao',
          detail: { educator: true },
          at: new Date('2026-03-01T10:00:00Z'),
        },
        { id: 'a2', action: 'odd.thing', by: 'u9', target: null, detail: {}, at: null },
      ],
    });
    const { container } = await openApp('/admin/audit', { ...adminCaller, console: c });
    expect(await screen.findByText('Changed a role')).toBeTruthy();
    expect(screen.getByText('boss@nonstopio.com')).toBeTruthy();
    expect(screen.getByText('Dev Rao')).toBeTruthy();
    expect(screen.getByText('Now educator')).toBeTruthy();
    expect(screen.getByText('odd.thing')).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('loads older entries on request, and says when that fails', async () => {
    const row = (id: string): AuditRow => ({
      id,
      action: 'course.publish',
      by: 'boss@nonstopio.com',
      target: id,
      detail: { version: 2 },
      at: new Date('2026-03-01T10:00:00Z'),
    });
    const cursor = { at: new Date('2026-03-01T10:00:00Z'), id: 'one' };
    const c = fakeConsole();
    c.data.auditPage = vi
      .fn()
      .mockResolvedValueOnce({ rows: [row('one')], nextCursor: cursor })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ rows: [row('two')], nextCursor: { ...cursor, id: 'two' } })
      .mockResolvedValueOnce({ rows: [row('three')], nextCursor: null });
    await openApp('/admin/audit', { ...adminCaller, console: c });
    fireEvent.click(await screen.findByRole('button', { name: 'Load older entries' }));
    expect(await screen.findByText(/Could not load more entries/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Load older entries' }));
    expect(await screen.findByText('two')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Load older entries' }));
    expect(await screen.findByText('three')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Load older entries' })).toBeNull();
    expect(c.data.auditPage).toHaveBeenLastCalledWith({ ...cursor, id: 'two' }, 50);
  });

  it('says so when nothing has been recorded', async () => {
    await openApp('/admin/audit', { ...adminCaller });
    expect(await screen.findByText('Nothing recorded yet')).toBeTruthy();
  });
});

describe('Course analytics', () => {
  const course = {
    assigned: 10,
    started: 8,
    completed: 3,
    certified: 3,
    finishDaysSum: 21,
    finishDaysHistogram: { '5': 1, '7': 1, '9': 1 },
    chapterCompletions: [7, 2],
    questionFirstTry: { k1: { correct: 1, total: 4 }, k2: { correct: 3, total: 4 } },
  };

  it('shows the funnel with its computed biggest drop and the hardest questions', async () => {
    const c = fakeConsole({ course });
    const { container } = await openApp('/admin/courses/git', { ...adminCaller, console: c });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Git, the NonStop Way' }),
    ).toBeTruthy();
    expect(screen.getByText('Published · v1')).toBeTruthy();
    expect(screen.getByText('Median time to finish')).toBeTruthy();
    expect(screen.getByText('7 days')).toBeTruthy();
    expect(screen.getByText('average 7 days')).toBeTruthy();
    expect(screen.getByText('80% of assigned')).toBeTruthy();
    expect(screen.getByText(/The biggest drop is between/)).toBeTruthy();
    expect(screen.getByText(/25% right first time/)).toBeTruthy();
    expect(screen.getByText('Quiz I')).toBeTruthy();
    expect(screen.getByText('25%').closest('.g-chip--warning')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Edit in Studio' }).getAttribute('href')).toBe(
      '/studio/courses/git',
    );
    expect(screen.getByRole('link', { name: 'Edit this Quiz' }).getAttribute('href')).toBe(
      '/studio/courses/git/quiz/q1',
    );
    expect(
      screen.getAllByRole('link', { name: 'Edit question' }).map((a) => a.getAttribute('href')),
    ).toContain('/studio/courses/git/quiz/q1?question=k1');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('copes with an empty course: no funnel sentence, no hard questions, dashes', async () => {
    const d = fakeData({ courses: [makeCourse({ status: 'draft' })] });
    await openApp('/admin/courses/git', { ...adminCaller, data: d });
    expect(await screen.findByText('Not enough attempts yet')).toBeTruthy();
    expect(screen.queryByText(/The biggest drop/)).toBeNull();
    expect(screen.getByText('Draft')).toBeTruthy();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('names an archived course in its status chip', async () => {
    const d = fakeData({ courses: [makeCourse({ status: 'archived' })] });
    await openApp('/admin/courses/git', { ...adminCaller, data: d });
    expect(await screen.findByText('Archived')).toBeTruthy();
  });

  it('keeps the warning colour for a Quiz below 70% only', async () => {
    const c = fakeConsole({ course: { questionFirstTry: { k1: { correct: 3, total: 4 } } } });
    await openApp('/admin/courses/git', { ...adminCaller, console: c });
    const cells = await screen.findAllByText('75%');
    expect(cells.every((el) => el.closest('.g-chip') === null)).toBe(true);
  });

  it('uses the warning colour for a question between 50% and 70%', async () => {
    const c = fakeConsole({ course: { questionFirstTry: { k1: { correct: 2, total: 3 } } } });
    await openApp('/admin/courses/git', { ...adminCaller, console: c });
    expect(
      (await screen.findByText(/67% right first time/)).closest('.g-chip--warning'),
    ).toBeTruthy();
  });

  it('names an unknown question by its id, and handles an unknown course', async () => {
    const c = fakeConsole({ course: { questionFirstTry: { zzz: { correct: 0, total: 5 } } } });
    const { unmount } = await openApp('/admin/courses/git', { ...adminCaller, console: c });
    expect(await screen.findByText(/zzz/)).toBeTruthy();
    expect(screen.getByText(/0% right first time/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Edit question' })).toBeNull();
    unmount();
    await openApp('/admin/courses/nope', { ...adminCaller });
    expect(await screen.findByText('This course does not exist')).toBeTruthy();
  });
});

describe('Roles & access', () => {
  const educator = userRow(1, {
    displayName: 'Asha',
    roles: ['learner', 'educator'],
    grantedCourseIds: ['git', 'gone'],
  });
  const admin = userRow(2, { displayName: 'Admin', roles: ['learner', 'admin'] });

  it('shows the roles, the matrix and who holds them', async () => {
    const c = fakeConsole({ users: [educator, admin] });
    const { container } = await openApp('/admin/roles', { ...adminCaller, console: c });
    expect(await screen.findByRole('heading', { level: 1, name: 'Roles & access' })).toBeTruthy();
    expect(await screen.findByText('Asha')).toBeTruthy();
    expect(screen.getByText('Git, the NonStop Way')).toBeTruthy();
    expect(screen.getByText('gone')).toBeTruthy();
    expect(screen.getByRole('table', { name: 'What each role can do' })).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('counts every person who has signed in as a Learner, and lists the Admins', async () => {
    const nameless = userRow(8, {
      displayName: '',
      email: 'nameless@nonstopio.com',
      roles: ['admin'],
    });
    const c = fakeConsole({ users: [educator, admin, nameless], count: 42 });
    await openApp('/admin/roles', { ...adminCaller, console: c });
    const card = (await screen.findByRole('region', { name: 'Learner' })) as HTMLElement;
    expect(within(card).getByText('42')).toBeTruthy();
    const list = screen.getByRole('region', { name: 'Admins' });
    expect(within(list).getByText('Admin')).toBeTruthy();
    expect(within(list).getByText('user2@nonstopio.com')).toBeTruthy();
    expect(within(list).queryByText('Asha')).toBeNull();
    expect(within(list).getAllByText('nameless@nonstopio.com')).toHaveLength(2);
    fireEvent.click(within(list).getByRole('button', { name: 'Edit Admin as Admin' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('switch', { name: /Admin/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save role' }));
    await waitFor(() =>
      expect(c.service.setRoles).toHaveBeenCalledWith({
        uid: 'u2',
        educator: false,
        admin: false,
        grantedCourseIds: [],
      }),
    );
  });

  it('keeps Educator and Admin together, and offers unpublished courses to grant', async () => {
    const draft = makeCourse({ id: 'wip', title: 'Work in progress', status: 'draft' });
    const old = makeCourse({ id: 'old', title: 'Old course', status: 'archived' });
    const both = userRow(7, { displayName: 'Both', roles: ['learner', 'educator', 'admin'] });
    const c = fakeConsole({ users: [both], courses: [makeCourse(), draft, old] });
    await openApp('/admin/roles', { ...adminCaller, console: c });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Both' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      (within(dialog).getByRole('switch', { name: /Educator/ }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (within(dialog).getByRole('switch', { name: /Admin/ }) as HTMLInputElement).checked,
    ).toBe(true);
    fireEvent.click(within(dialog).getByLabelText('Work in progress (not published)'));
    fireEvent.click(within(dialog).getByLabelText('Old course (archived)'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save role' }));
    await waitFor(() =>
      expect(c.service.setRoles).toHaveBeenCalledWith({
        uid: 'u7',
        educator: true,
        admin: true,
        grantedCourseIds: ['wip', 'old'],
      }),
    );
  });

  it('says there are no Educators, and no courses granted', async () => {
    const lone = userRow(3, {
      displayName: '',
      roles: ['learner', 'educator'],
      email: 'solo@nonstopio.com',
    });
    const { unmount } = await openApp('/admin/roles', {
      ...adminCaller,
      console: fakeConsole(),
    });
    expect(await screen.findByRole('heading', { name: 'No Educators yet' })).toBeTruthy();
    unmount();
    await openApp('/admin/roles', {
      ...adminCaller,
      console: fakeConsole({ users: [lone] }),
    });
    expect(await screen.findByText('solo@nonstopio.com')).toBeTruthy();
    expect(screen.getByText('No courses yet')).toBeTruthy();
  });

  it('reads the person again when they are picked, so an old search cannot undo a grant', async () => {
    const stale = userRow(5, {
      displayName: 'Ravi',
      email: 'ravi@nonstopio.com',
      roles: ['learner'],
    });
    const fresh = { ...stale, roles: ['learner', 'educator'] };
    const c = fakeConsole({ found: [stale] });
    c.data.usersByUid = vi.fn().mockResolvedValue([fresh]);
    await openApp('/admin/roles', { ...adminCaller, console: c });
    fireEvent.click(await screen.findByRole('button', { name: 'Grant a role' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(
      within(dialog).getByRole('combobox', { name: 'Find a person by name or email' }),
      {
        target: { value: 'rav' },
      },
    );
    fireEvent.mouseDown(await within(dialog).findByRole('option', { name: /Ravi/ }));
    const educator = (await within(dialog).findByRole('switch', {
      name: /Educator/,
    })) as HTMLInputElement;
    expect(c.data.usersByUid).toHaveBeenCalledWith([stale.uid]);
    expect(educator.checked).toBe(true);
  });

  it('falls back to the searched profile when the fresh read finds nobody', async () => {
    const found = userRow(5, { displayName: 'Ravi', email: 'ravi@nonstopio.com' });
    const c = fakeConsole({ found: [found] });
    c.data.usersByUid = vi.fn().mockResolvedValue([]);
    await openApp('/admin/roles', { ...adminCaller, console: c });
    fireEvent.click(await screen.findByRole('button', { name: 'Grant a role' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(
      within(dialog).getByRole('combobox', { name: 'Find a person by name or email' }),
      {
        target: { value: 'rav' },
      },
    );
    fireEvent.mouseDown(await within(dialog).findByRole('option', { name: /Ravi/ }));
    expect(await within(dialog).findByRole('switch', { name: /Educator/ })).toBeTruthy();
  });

  it('searches and pages a long list of courses in the grant dialog, keeping what was picked', async () => {
    const many = Array.from({ length: 14 }, (_, i) =>
      makeCourse({ id: `c${i}`, title: `Topic ${String(i).padStart(2, '0')}` }),
    );
    const c = fakeConsole({ users: [educator], courses: many });
    await openApp('/admin/roles', { ...adminCaller, console: c });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Asha' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Showing 6 of 14 courses/)).toBeTruthy();
    expect(within(dialog).queryByLabelText('Topic 13')).toBeNull();
    fireEvent.click(within(dialog).getByLabelText('Topic 00'));
    expect(within(dialog).getByText(/\d selected/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Show 6 more' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Show 2 more' }));
    expect(within(dialog).getByLabelText('Topic 13')).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: /^Show \d+ more/ })).toBeNull();
    fireEvent.change(within(dialog).getByRole('searchbox', { name: 'Search courses' }), {
      target: { value: 'topic 07' },
    });
    expect(within(dialog).getByText(/1 of 14 courses match/)).toBeTruthy();
    expect(within(dialog).queryByLabelText('Topic 00')).toBeNull();
  });

  it('edits an Educator: changes their courses and saves through setRoles', async () => {
    const c = fakeConsole({ users: [educator] });
    await openApp('/admin/roles', { ...adminCaller, console: c });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Asha' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByLabelText(/Git, the NonStop Way/));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save role' }));
    await waitFor(() =>
      expect(c.service.setRoles).toHaveBeenCalledWith({
        uid: 'u1',
        educator: true,
        admin: false,
        grantedCourseIds: ['gone'],
      }),
    );
    expect(await screen.findByText('Updated Asha')).toBeTruthy();
  });

  it('grants a role to someone found by email, then re-checks a course', async () => {
    const found = userRow(5, { displayName: 'Ravi', email: 'ravi@nonstopio.com' });
    const c = fakeConsole({ found: [found] });
    await openApp('/admin/roles', { ...adminCaller, console: c });
    fireEvent.click(await screen.findByRole('button', { name: 'Grant a role' }));
    const dialog = await screen.findByRole('dialog');
    const save = within(dialog).getByRole('button', { name: 'Save role' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(
      within(dialog).getByRole('combobox', { name: 'Find a person by name or email' }),
      {
        target: { value: 'rav' },
      },
    );
    fireEvent.mouseDown(await within(dialog).findByRole('option', { name: /Ravi/ }));
    fireEvent.click(await within(dialog).findByRole('switch', { name: /Educator/ }));
    fireEvent.click(within(dialog).getByLabelText(/Git, the NonStop Way/));
    fireEvent.click(within(dialog).getByLabelText(/Git, the NonStop Way/));
    fireEvent.click(within(dialog).getByLabelText(/Git, the NonStop Way/));
    fireEvent.click(within(dialog).getByRole('switch', { name: /Educator/ }));
    expect(within(dialog).queryByText('Courses they may edit')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save role' }));
    await waitFor(() =>
      expect(c.service.setRoles).toHaveBeenCalledWith({
        uid: 'u5',
        educator: false,
        admin: false,
        grantedCourseIds: [],
      }),
    );
  });

  it('names a person by email when they have no display name, in the dialog, the title and the toast', async () => {
    const solo = userRow(3, {
      displayName: '',
      email: 'solo@nonstopio.com',
      roles: ['learner', 'educator'],
    });
    const c = fakeConsole({ users: [solo], found: [solo] });
    await openApp('/admin/roles', { ...adminCaller, console: c });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit solo@nonstopio.com' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit solo@nonstopio.com' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save role' }));
    expect(await screen.findByText('Updated solo@nonstopio.com')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Grant a role' }));
    const grant = await screen.findByRole('dialog', { name: 'Grant a role' });
    fireEvent.change(
      within(grant).getByRole('combobox', { name: 'Find a person by name or email' }),
      {
        target: { value: 'sol' },
      },
    );
    fireEvent.mouseDown(await within(grant).findByRole('option', { name: /solo@nonstopio.com/ }));
    expect(await within(grant).findByText(/· solo@nonstopio.com/)).toBeTruthy();
  });

  it('refuses to let an Admin remove their own role, and says so', async () => {
    const me = userRow(0, { uid: 'u1', displayName: 'Me', roles: ['learner', 'admin'] });
    const c = fakeConsole({ users: [me], found: [me] });
    await openApp('/admin/roles', { ...adminCaller, console: c });
    fireEvent.click(await screen.findByRole('button', { name: 'Grant a role' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(
      within(dialog).getByRole('combobox', { name: 'Find a person by name or email' }),
      {
        target: { value: 'me' },
      },
    );
    fireEvent.mouseDown(await within(dialog).findByRole('option', { name: /Me/ }));
    const box = (await within(dialog).findByRole('switch', { name: /Admin/ })) as HTMLInputElement;
    expect(box.disabled).toBe(true);
    expect(box.checked).toBe(true);
    expect(within(dialog).getByText(/cannot remove your own Admin role/)).toBeTruthy();
  });

  it('keeps the dialog open and says so when the change fails', async () => {
    const c = fakeConsole({ users: [educator] });
    c.service.setRoles = vi.fn().mockRejectedValue(new Error('no'));
    await openApp('/admin/roles', { ...adminCaller, console: c });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Asha' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Save role' }),
    );
    expect(await screen.findByText('Could not change the role. Try again.')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('Overview: Needs attention', () => {
  const failedRow = (uid: string, attempts = 2, passed = false) => ({
    ...progressRow({
      quiz: { q1: { best: 0.4, passed, attempts, lastAttemptAt: new Date() } },
    }),
    uid,
  });

  it('lists overdue people with Nudge, failed-twice with Reset and pending invites with Resend', async () => {
    const c = fakeConsole({
      users: [userRow(1, { displayName: 'Asha' })],
      assignments: [],
      open: [
        asg('late@nonstopio.com', { uid: 'u9', dueAt: past, status: 'started' }),
        asg('new@nonstopio.com', { uid: null }),
        asg('gone@nonstopio.com', { uid: 'u8', dueAt: past, courseId: 'removed' }),
      ],
      recent: [
        failedRow('u1'),
        failedRow('u2', 1),
        failedRow('u3', 3, true),
        {
          ...failedRow('u4'),
          quiz: { zz: { best: 0.4, passed: false, attempts: 2, lastAttemptAt: new Date() } },
        },
      ],
    });
    const { container } = await openApp('/admin', { ...adminCaller, console: c });
    fireEvent.click(await screen.findByRole('button', { name: 'Nudge late@nonstopio.com' }));
    await waitFor(() =>
      expect(c.service.remindLearners).toHaveBeenCalledWith({ emails: ['late@nonstopio.com'] }),
    );
    expect(await screen.findByText('Reminder sent')).toBeTruthy();
    expect(screen.getByText(/Quiz I: 2 attempts, not passed/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reset User 2' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reset Asha' }));
    await waitFor(() =>
      expect(c.service.resetCooldown).toHaveBeenCalledWith({
        uid: 'u1',
        courseId: 'git',
        quizId: 'q1',
      }),
    );
    expect(await screen.findByText('Retake opened')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Resend to new@nonstopio.com' }));
    await waitFor(() =>
      expect(c.service.remindLearners).toHaveBeenCalledWith({ emails: ['new@nonstopio.com'] }),
    );
    expect(screen.getByText(/removed was due/)).toBeTruthy();
    expect(screen.getByText(/zz: 2 attempts/)).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('says so when a reminder was skipped or an action fails', async () => {
    const c = fakeConsole({
      assignments: [],
      open: [asg('late@nonstopio.com', { uid: 'u9', dueAt: past, status: 'started' })],
      recent: [failedRow('u7')],
    });
    vi.mocked(c.service.remindLearners).mockResolvedValueOnce({ sent: 0, skipped: 1 });
    await openApp('/admin', { ...adminCaller, console: c });
    fireEvent.click(await screen.findByRole('button', { name: 'Nudge late@nonstopio.com' }));
    expect(await screen.findByText('Already reminded today.')).toBeTruthy();
    vi.mocked(c.service.remindLearners).mockRejectedValueOnce(new Error('x'));
    fireEvent.click(screen.getByRole('button', { name: 'Nudge late@nonstopio.com' }));
    expect(await screen.findByText('Could not send that. Try again.')).toBeTruthy();
    vi.mocked(c.service.resetCooldown).mockRejectedValueOnce(new Error('x'));
    fireEvent.click(screen.getByRole('button', { name: 'Reset u7' }));
    expect(await screen.findByText('Could not open the retake. Try again.')).toBeTruthy();
  });

  it('shows empty lists and counts the invites past the first five', async () => {
    const none = fakeConsole({ assignments: [] });
    const first = await openApp('/admin', { ...adminCaller, console: none });
    expect(await screen.findByText('Nobody is overdue')).toBeTruthy();
    expect(screen.getByText('Nobody is stuck')).toBeTruthy();
    expect(screen.getByText('No pending invites')).toBeTruthy();
    first.unmount();
    const many = fakeConsole({
      assignments: [],
      open: Array.from({ length: 7 }, (_, i) => asg(`p${i}@nonstopio.com`, { assignedAt: null })),
    });
    await openApp('/admin', { ...adminCaller, console: many });
    expect(await screen.findByText('and 2 more')).toBeTruthy();
    expect(screen.getAllByText('Not signed in yet')).toHaveLength(5);
  });

  it('narrows the lists by team and by date range', async () => {
    const c = fakeConsole({
      teams: ['QA'],
      team: [userRow(1, { team: 'QA', email: 'in@nonstopio.com' })],
      assignments: [],
      open: [
        asg('in@nonstopio.com', { uid: 'u1', dueAt: past, status: 'started' }),
        asg('out@nonstopio.com', { uid: 'u2', dueAt: past, status: 'started' }),
        asg('old@nonstopio.com', {
          uid: 'u3',
          dueAt: new Date('2020-01-01T00:00:00Z'),
          status: 'started',
        }),
      ],
      recent: [failedRow('u1'), failedRow('u2')],
    });
    await openApp('/admin', { ...adminCaller, console: c });
    await screen.findByRole('button', { name: 'Nudge out@nonstopio.com' });
    fireEvent.change(screen.getByLabelText('Team'), { target: { value: 'QA' } });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Nudge out@nonstopio.com' })).toBeNull(),
    );
    expect(screen.getByRole('button', { name: 'Nudge in@nonstopio.com' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Reset/ })).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Team'), { target: { value: '' } });
    await screen.findByRole('button', { name: 'Nudge old@nonstopio.com' });
    fireEvent.change(screen.getByLabelText('Date range'), { target: { value: '30d' } });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Nudge old@nonstopio.com' })).toBeNull(),
    );
    expect(screen.getByRole('button', { name: 'Nudge out@nonstopio.com' })).toBeTruthy();
  });
});
