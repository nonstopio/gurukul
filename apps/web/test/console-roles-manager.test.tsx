import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Team } from '@gurukul/schema';
import { describe, expect, it } from 'vitest';
import { auditDetail, auditLabel, dueDay } from '../src/console/model';
import { terms } from '../src/labels/terms';
import { axeViolations } from './axe';
import { fakeConsole, userRow } from './fake-console';
import { openApp } from './harness';
import { choose } from './select';

const admin = { roles: ['admin'] as Array<'admin'> };
const lead = userRow(4, {
  displayName: 'Neha',
  email: 'Neha@nonstopio.com',
  roles: ['learner', 'manager'],
});
const team = (id: string, managerEmails?: string[]): Team => ({
  id,
  name: id.toUpperCase(),
  memberEmails: ['a@nonstopio.com'],
  createdAt: 5,
  ...(managerEmails ? { managerEmails } : {}),
});

describe('Roles & access: Managers', () => {
  it('counts and lists Managers with the teams they manage, and a matrix column', async () => {
    const other = userRow(6, { displayName: '', roles: ['learner', 'manager'] });
    const c = fakeConsole({
      users: [lead, other],
      teamList: [team('web', ['neha@nonstopio.com']), team('qa')],
    });
    const { container } = await openApp('/admin/roles', { ...admin, console: c });
    const card = (await screen.findByRole('region', { name: 'Manager' })) as HTMLElement;
    expect(within(card).getByText('2')).toBeTruthy();
    const list = screen.getByRole('region', { name: 'Managers' });
    expect(within(list).getByText('Neha')).toBeTruthy();
    expect(within(list).getByText('WEB')).toBeTruthy();
    expect(within(list).getByText('No teams yet')).toBeTruthy();
    expect(
      within(list).getByRole('button', { name: 'Edit user6@nonstopio.com as Manager' }),
    ).toBeTruthy();
    const matrix = screen.getByRole('table', { name: 'What each role can do' });
    expect(within(matrix).getByRole('columnheader', { name: 'Manager' })).toBeTruthy();
    expect(within(matrix).getByRole('row', { name: /Create and edit teams/ }).textContent).toBe(
      'Create and edit teamsNoNoOwn teamsYes',
    );
    expect(await axeViolations(container)).toEqual([]);
  });

  it('says there are no Managers yet', async () => {
    await openApp('/admin/roles', { ...admin, console: fakeConsole() });
    expect(await screen.findByRole('heading', { name: 'No Managers yet' })).toBeTruthy();
  });

  it('grants and takes away the Manager role on its own switch, warning about the handover', async () => {
    const c = fakeConsole({ users: [lead] });
    await openApp('/admin/roles', { ...admin, console: c });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Neha as Manager' }));
    const dialog = await screen.findByRole('dialog');
    const toggle = within(dialog).getByRole('switch', { name: /Manager/ }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    expect(within(dialog).queryByText(/takes them off every team/)).toBeNull();
    fireEvent.click(toggle);
    expect(within(dialog).getByText(/takes them off every team they manage/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('switch', { name: /Educator/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save role' }));
    await waitFor(() =>
      expect(c.service.setRoles).toHaveBeenCalledWith({
        uid: 'u4',
        educator: true,
        manager: false,
        admin: false,
        grantedCourseIds: [],
      }),
    );
  });
});

describe('Learners: the Manager role', () => {
  it('names Managers in the role column, filters by it and changes it in bulk', async () => {
    const c = fakeConsole({ users: [lead, userRow(5)] });
    await openApp('/admin/learners', { ...admin, console: c });
    const table = await screen.findByRole('table', { name: 'Learners' });
    expect(within(table).getByRole('row', { name: /Neha/ }).textContent).toContain('Manager');
    await choose(screen.getByRole('combobox', { name: 'Role' }), 'Manager');
    await waitFor(() => expect(c.data.usersWithRole).toHaveBeenCalledWith('manager'));

    fireEvent.click(await screen.findByRole('checkbox', { name: /Select Neha/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Change role' }));
    const dialog = await screen.findByRole('dialog', { name: 'Change role' });
    await choose(within(dialog).getByRole('combobox', { name: 'Educator' }), 'Leave as it is');
    await choose(within(dialog).getByRole('combobox', { name: 'Manager' }), 'Remove Manager');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply to 1 person' }));
    await waitFor(() =>
      expect(c.service.setRoles).toHaveBeenCalledWith({ uid: 'u4', manager: false }),
    );
  });
});

describe('the audit log words for Managers', () => {
  const t = terms('generic');
  it('names the role and the team callables', () => {
    expect(auditDetail('roles.set', { manager: true }, t)).toBe('Now manager');
    expect(auditLabel('assign.update', t)).toBe('Changed a due date');
    expect(auditLabel('assign.remove', t)).toBe('Removed an assignment');
    const due = Date.UTC(2026, 10, 20, 12);
    expect(auditDetail('assign.update', { courseId: 'git', dueAt: due }, t)).toBe(
      `git: due ${dueDay(due)}`,
    );
    expect(auditDetail('assign.update', { dueAt: null }, t)).toBe('?: no due date');
    expect(auditDetail('assign.remove', { courseId: 'git' }, t)).toBe('git');
  });
});
