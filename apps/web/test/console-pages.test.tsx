import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AssignmentFull } from '../src/console/types';
import { axeViolations } from './axe';
import { fakeConsole, userRow } from './fake-console';
import { fakeData, makeCourse } from './fake-data';
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
const past = new Date(Date.now() - 5 * 86_400_000);

describe('console access', () => {
  it('shows not-allowed to a Shishya on every console page', async () => {
    for (const path of [
      '/kulapati',
      '/kulapati/learners',
      '/kulapati/assign',
      '/kulapati/roles',
      '/kulapati/courses/git',
    ]) {
      const { unmount } = await openApp(path);
      expect(await screen.findByRole('heading', { name: /do not have access/ })).toBeTruthy();
      unmount();
    }
  });

  it('lists the console in the sidebar for a Kulapati', async () => {
    await openApp('/kulapati', { ...kulapati });
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    for (const name of ['Overview', 'Learners', 'Assign courses', 'Roles & access']) {
      expect(within(nav).getByRole('link', { name })).toBeTruthy();
    }
  });
});

describe('Overview', () => {
  it('shows dashes and empty states for an empty organisation', async () => {
    await openApp('/kulapati', { ...kulapati, data: fakeData({ courses: [] }) });
    expect(await screen.findByText('No learners yet')).toBeTruthy();
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
        weekly: { [week]: 9 },
      },
      course: { assigned: 10, started: 8, completed: 4, scoreSum: 3.2, scoreCount: 4 },
      assignments: [asg('a@nonstopio.com', { dueAt: past }), asg('b@nonstopio.com', { uid: 'u2' })],
    });
    const { container } = await openApp('/kulapati', { ...kulapati, console: c });
    expect(await screen.findByText('12')).toBeTruthy();
    expect(screen.getByText('40%')).toBeTruthy();
    expect(screen.getByText('4 of 10')).toBeTruthy();
    expect(screen.getByRole('img', { name: /Lessons completed per week/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Git, the NonStop Way' }).getAttribute('href')).toBe(
      '/kulapati/courses/git',
    );
    expect(screen.getByText('4 (40%)')).toBeTruthy();
    expect(screen.getByText('80%')).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('shows dashes for a course nobody has started', async () => {
    await openApp('/kulapati', { ...kulapati });
    expect(await screen.findByRole('link', { name: 'Git, the NonStop Way' })).toBeTruthy();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});

describe('Course analytics', () => {
  const course = {
    assigned: 10,
    started: 8,
    completed: 3,
    certified: 3,
    finishDaysSum: 21,
    parvaCompletions: [7, 2],
    questionFirstTry: { k1: { correct: 1, total: 4 }, k2: { correct: 3, total: 4 } },
  };

  it('shows the funnel with its computed biggest drop and the hardest questions', async () => {
    const c = fakeConsole({ course });
    const { container } = await openApp('/kulapati/courses/git', { ...kulapati, console: c });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Git, the NonStop Way' }),
    ).toBeTruthy();
    expect(screen.getByText('Published · v1')).toBeTruthy();
    expect(screen.getByText('7 days')).toBeTruthy();
    expect(screen.getByText('80% of assigned')).toBeTruthy();
    expect(screen.getByText(/The biggest drop is between/)).toBeTruthy();
    expect(screen.getByText(/25% right first time/)).toBeTruthy();
    expect(screen.getByText('Pariksha I')).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('copes with an empty course: no funnel sentence, no hard questions, dashes', async () => {
    const d = fakeData({ courses: [makeCourse({ status: 'draft' })] });
    await openApp('/kulapati/courses/git', { ...kulapati, data: d });
    expect(await screen.findByText('Not enough attempts yet')).toBeTruthy();
    expect(screen.queryByText(/The biggest drop/)).toBeNull();
    expect(screen.getByText('draft')).toBeTruthy();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('names an unknown question by its id, and handles an unknown course', async () => {
    const c = fakeConsole({ course: { questionFirstTry: { zzz: { correct: 0, total: 5 } } } });
    const { unmount } = await openApp('/kulapati/courses/git', { ...kulapati, console: c });
    expect(await screen.findByText(/zzz/)).toBeTruthy();
    expect(screen.getByText(/0% right first time/)).toBeTruthy();
    unmount();
    await openApp('/kulapati/courses/nope', { ...kulapati });
    expect(await screen.findByText('This course does not exist')).toBeTruthy();
  });
});

describe('Roles & access', () => {
  const acharya = userRow(1, {
    displayName: 'Asha',
    roles: ['shishya', 'acharya'],
    grantedCourseIds: ['git', 'gone'],
  });
  const admin = userRow(2, { displayName: 'Admin', roles: ['shishya', 'kulapati'] });

  it('shows the roles, the matrix and who holds them', async () => {
    const c = fakeConsole({ users: [acharya, admin] });
    const { container } = await openApp('/kulapati/roles', { ...kulapati, console: c });
    expect(await screen.findByRole('heading', { level: 1, name: 'Roles & access' })).toBeTruthy();
    expect(await screen.findByText('Asha')).toBeTruthy();
    expect(screen.getByText('Git, the NonStop Way')).toBeTruthy();
    expect(screen.getByText('gone')).toBeTruthy();
    expect(screen.getByRole('table', { name: 'What each role can do' })).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('says there are no Acharyas, and no courses granted', async () => {
    const lone = userRow(3, {
      displayName: '',
      roles: ['shishya', 'acharya'],
      email: 'solo@nonstopio.com',
    });
    const { unmount } = await openApp('/kulapati/roles', { ...kulapati, console: fakeConsole() });
    expect(await screen.findByText('No Acharyas yet.')).toBeTruthy();
    unmount();
    await openApp('/kulapati/roles', { ...kulapati, console: fakeConsole({ users: [lone] }) });
    expect(await screen.findByText('solo@nonstopio.com')).toBeTruthy();
    expect(screen.getByText('No courses yet')).toBeTruthy();
  });

  it('edits an Acharya: changes their courses and saves through setRoles', async () => {
    const c = fakeConsole({ users: [acharya] });
    await openApp('/kulapati/roles', { ...kulapati, console: c });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Asha' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByLabelText(/Git, the NonStop Way/));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save role' }));
    await waitFor(() =>
      expect(c.service.setRoles).toHaveBeenCalledWith({
        uid: 'u1',
        acharya: true,
        kulapati: false,
        grantedCourseIds: ['gone'],
      }),
    );
    expect(await screen.findByText('Updated Asha')).toBeTruthy();
  });

  it('grants a role to someone found by email, then re-checks a course', async () => {
    const found = userRow(5, { displayName: 'Ravi', email: 'ravi@nonstopio.com' });
    const c = fakeConsole({ found: [found] });
    await openApp('/kulapati/roles', { ...kulapati, console: c });
    fireEvent.click(await screen.findByRole('button', { name: 'Grant a role' }));
    const dialog = await screen.findByRole('dialog');
    const save = within(dialog).getByRole('button', { name: 'Save role' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('Find a person by email'), {
      target: { value: 'r' },
    });
    expect(c.data.searchUsers).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText('Find a person by email'), {
      target: { value: 'rav' },
    });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Ravi' }));
    fireEvent.click(within(dialog).getByRole('radio', { name: /Acharya/ }));
    fireEvent.click(within(dialog).getByLabelText(/Git, the NonStop Way/));
    fireEvent.click(within(dialog).getByLabelText(/Git, the NonStop Way/));
    fireEvent.click(within(dialog).getByLabelText(/Git, the NonStop Way/));
    fireEvent.click(within(dialog).getByRole('radio', { name: /Kulapati/ }));
    expect(within(dialog).queryByText('Courses they may edit')).toBeNull();
    fireEvent.click(within(dialog).getByRole('radio', { name: /Shishya/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save role' }));
    await waitFor(() =>
      expect(c.service.setRoles).toHaveBeenCalledWith({
        uid: 'u5',
        acharya: false,
        kulapati: false,
        grantedCourseIds: [],
      }),
    );
  });

  it('names a person by email when they have no display name, in the dialog, the title and the toast', async () => {
    const solo = userRow(3, {
      displayName: '',
      email: 'solo@nonstopio.com',
      roles: ['shishya', 'acharya'],
    });
    const c = fakeConsole({ users: [solo], found: [solo] });
    await openApp('/kulapati/roles', { ...kulapati, console: c });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit solo@nonstopio.com' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit solo@nonstopio.com' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save role' }));
    expect(await screen.findByText('Updated solo@nonstopio.com')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Grant a role' }));
    const grant = await screen.findByRole('dialog', { name: 'Grant a role' });
    fireEvent.change(within(grant).getByLabelText('Find a person by email'), {
      target: { value: 'sol' },
    });
    fireEvent.click(await within(grant).findByRole('button', { name: 'solo@nonstopio.com' }));
    expect(within(grant).getByText(/· solo@nonstopio.com/)).toBeTruthy();
  });

  it('refuses to let a Kulapati remove their own role, and says so', async () => {
    const me = userRow(0, { uid: 'u1', displayName: 'Me', roles: ['shishya', 'kulapati'] });
    const c = fakeConsole({ users: [me], found: [me] });
    await openApp('/kulapati/roles', { ...kulapati, console: c });
    fireEvent.click(await screen.findByRole('button', { name: 'Grant a role' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Find a person by email'), {
      target: { value: 'me' },
    });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Me' }));
    expect(
      (within(dialog).getByRole('radio', { name: /Shishya/ }) as HTMLInputElement).disabled,
    ).toBe(true);
    expect(within(dialog).getByText(/cannot remove your own Kulapati role/)).toBeTruthy();
    expect(
      (within(dialog).getByRole('radio', { name: /Kulapati/ }) as HTMLInputElement).checked,
    ).toBe(true);
  });

  it('keeps the dialog open and says so when the change fails', async () => {
    const c = fakeConsole({ users: [acharya] });
    c.service.setRoles = vi.fn().mockRejectedValue(new Error('no'));
    await openApp('/kulapati/roles', { ...kulapati, console: c });
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
