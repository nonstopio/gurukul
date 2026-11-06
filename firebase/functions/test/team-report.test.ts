import { describe, expect, it, vi } from 'vitest';
import { removeAssignment, teamReport, updateAssignment } from '../src/team-report.js';
import type { ManagedAssignment, TeamReportStore } from '../src/team-report.js';

const NOW = Date.UTC(2026, 10, 5);
const admin = { uid: 'k', email: 'k@nonstopio.com', claims: { admin: true } };
const manager = { uid: 'm', email: 'm@nonstopio.com', claims: { manager: true } };
const sales = {
  id: 'sales',
  name: 'Sales',
  memberEmails: ['Priya@nonstopio.com', 'new@nonstopio.com', 'rohan@nonstopio.com'],
  managerEmails: ['m@nonstopio.com'],
};
const row = (id: string, over: Partial<ManagedAssignment> = {}): ManagedAssignment => ({
  id,
  email: 'priya@nonstopio.com',
  uid: 'priya',
  courseId: 'git',
  status: 'started',
  dueAt: NOW + 1000,
  teamId: 'sales',
  ...over,
});

function setup(over: Partial<TeamReportStore> = {}): TeamReportStore {
  return {
    team: vi.fn(async (id: string) => (id === 'sales' ? sales : undefined)),
    assignment: vi.fn().mockResolvedValue(row('a1')),
    assignmentsFor: vi
      .fn()
      .mockResolvedValue([
        row('a1'),
        row('a2', { courseId: 'sql', status: 'completed', teamId: null }),
        row('a3', { email: 'new@nonstopio.com', uid: null, courseId: 'css', status: 'assigned' }),
        row('a4', { email: 'rohan@nonstopio.com', uid: null, courseId: 'go' }),
        row('a5', { courseId: 'unknown', status: 'started' }),
      ]),
    profiles: vi.fn().mockResolvedValue(
      new Map([
        ['priya@nonstopio.com', { uid: 'priya', displayName: 'Priya Example' }],
        ['rohan@nonstopio.com', { uid: 'rohan', displayName: null }],
      ]),
    ),
    percents: vi.fn().mockResolvedValue(new Map([['priya_git', 40]])),
    courseTitles: vi.fn().mockResolvedValue({ git: 'Git', sql: 'SQL', css: 'CSS', go: 'Go' }),
    setDueAt: vi.fn().mockResolvedValue(undefined),
    deleteAssignment: vi.fn().mockResolvedValue(undefined),
    audit: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

describe('teamReport', () => {
  it('lists each member with their assignments, percent from progress only when started', async () => {
    const store = setup();
    const report = await teamReport(store, manager, { teamId: 'sales' });
    expect(store.assignmentsFor).toHaveBeenCalledWith([
      'priya@nonstopio.com',
      'new@nonstopio.com',
      'rohan@nonstopio.com',
    ]);
    expect(store.percents).toHaveBeenCalledWith([
      { uid: 'priya', courseId: 'git' },
      { uid: 'rohan', courseId: 'go' },
      { uid: 'priya', courseId: 'unknown' },
    ]);
    expect(report).toEqual({
      teamId: 'sales',
      name: 'Sales',
      members: [
        {
          email: 'priya@nonstopio.com',
          uid: 'priya',
          displayName: 'Priya Example',
          assignments: [
            {
              assignmentId: 'a1',
              courseId: 'git',
              courseTitle: 'Git',
              status: 'started',
              dueAt: NOW + 1000,
              percent: 40,
              teamId: 'sales',
            },
            expect.objectContaining({ assignmentId: 'a2', percent: 100, teamId: null }),
            expect.objectContaining({ assignmentId: 'a5', courseTitle: 'unknown', percent: 0 }),
          ],
        },
        {
          email: 'new@nonstopio.com',
          uid: null,
          displayName: null,
          assignments: [expect.objectContaining({ assignmentId: 'a3', percent: 0 })],
        },
        {
          email: 'rohan@nonstopio.com',
          uid: 'rohan',
          displayName: null,
          assignments: [expect.objectContaining({ assignmentId: 'a4', percent: 0 })],
        },
      ],
    });
    expect(JSON.stringify(report)).not.toMatch(/score|quiz/i);
  });

  it('reads nothing more for an empty team, or a team with no started courses', async () => {
    const empty = setup({ team: vi.fn().mockResolvedValue({ ...sales, memberEmails: [] }) });
    expect((await teamReport(empty, admin, { teamId: 'sales' })).members).toEqual([]);
    expect(empty.assignmentsFor).not.toHaveBeenCalled();
    expect(empty.courseTitles).not.toHaveBeenCalled();
    const idle = setup({
      assignmentsFor: vi
        .fn()
        .mockResolvedValue([
          row('a3', { email: 'new@nonstopio.com', uid: null, status: 'started' }),
        ]),
    });
    const report = await teamReport(idle, admin, { teamId: 'sales' });
    expect(idle.percents).not.toHaveBeenCalled();
    expect(report.members[1]?.assignments[0]?.percent).toBe(0);
  });

  it('refuses a learner, a manager of another team, an unknown team and a bad id', async () => {
    const store = setup();
    await expect(
      teamReport(store, { uid: 'p', email: 'p@nonstopio.com', claims: {} }, { teamId: 'sales' }),
    ).rejects.toMatchObject({ code: 'AUTH_2001' });
    await expect(
      teamReport(store, { ...manager, email: 'z@nonstopio.com' }, { teamId: 'sales' }),
    ).rejects.toMatchObject({ code: 'AUTH_2001', details: { teamId: 'sales' } });
    await expect(teamReport(store, admin, { teamId: 'nope' })).rejects.toMatchObject({
      code: 'VAL_1003',
    });
    await expect(teamReport(store, admin, {})).rejects.toMatchObject({
      code: 'VAL_1001',
      details: { field: 'teamId' },
    });
  });
});

describe('updateAssignment', () => {
  it('sets a new due date, clears the notices and audits', async () => {
    const store = setup();
    expect(
      await updateAssignment(store, manager, { assignmentId: 'a1', dueAt: NOW + 5000 }, NOW),
    ).toEqual({ assignmentId: 'a1', dueAt: NOW + 5000 });
    expect(store.setDueAt).toHaveBeenCalledWith('a1', NOW + 5000);
    expect(store.audit).toHaveBeenCalledWith({
      action: 'assign.update',
      by: 'm',
      target: 'a1',
      detail: { courseId: 'git', teamId: 'sales', dueAt: NOW + 5000 },
    });
  });

  it('clears the due date, and lets an Admin change one made without a team', async () => {
    const store = setup({ assignment: vi.fn().mockResolvedValue(row('a2', { teamId: null })) });
    await updateAssignment(store, admin, { assignmentId: 'a2', dueAt: null }, NOW);
    expect(store.setDueAt).toHaveBeenCalledWith('a2', null);
    expect(store.team).not.toHaveBeenCalled();
  });

  it('refuses a bad or past date, an unknown assignment and one outside the manager’s teams', async () => {
    const store = setup();
    for (const [data, code, field] of [
      [{ assignmentId: 'a1', dueAt: 'soon' }, 'VAL_1002', 'dueAt'],
      [{ assignmentId: 'a1', dueAt: Infinity }, 'VAL_1002', 'dueAt'],
      [{ assignmentId: 'a1' }, 'VAL_1001', 'dueAt'],
      [{ assignmentId: 'a1', dueAt: NOW - 1 }, 'VAL_1002', 'dueAt'],
      [{ dueAt: null }, 'VAL_1001', 'assignmentId'],
    ] as const) {
      await expect(updateAssignment(store, manager, data, NOW)).rejects.toMatchObject({
        code,
        details: { field },
      });
    }
    const missing = setup({ assignment: vi.fn().mockResolvedValue(undefined) });
    await expect(
      updateAssignment(missing, admin, { assignmentId: 'x', dueAt: null }, NOW),
    ).rejects.toMatchObject({ code: 'VAL_1003', details: { field: 'assignmentId' } });
    for (const teamId of [null, 'other', 'sales']) {
      const outside = setup({
        assignment: vi.fn().mockResolvedValue(row('a1', { teamId })),
        team: vi.fn(async (id: string) =>
          id === 'sales' ? { ...sales, managerEmails: ['z@nonstopio.com'] } : undefined,
        ),
      });
      await expect(
        updateAssignment(outside, manager, { assignmentId: 'a1', dueAt: null }, NOW),
      ).rejects.toMatchObject({ code: 'AUTH_2001', details: { assignmentId: 'a1' } });
      expect(outside.setDueAt).not.toHaveBeenCalled();
    }
  });
});

describe('removeAssignment', () => {
  it('deletes the assignment and audits who it was for', async () => {
    const store = setup();
    expect(await removeAssignment(store, manager, { assignmentId: 'a1' })).toEqual({
      assignmentId: 'a1',
    });
    expect(store.deleteAssignment).toHaveBeenCalledWith(row('a1'));
    expect(store.audit).toHaveBeenCalledWith({
      action: 'assign.remove',
      by: 'm',
      target: 'a1',
      detail: { courseId: 'git', teamId: 'sales', email: 'priya@nonstopio.com' },
    });
  });

  it('refuses a learner and an assignment outside the manager’s teams', async () => {
    const store = setup({ assignment: vi.fn().mockResolvedValue(row('a1', { teamId: null })) });
    await expect(
      removeAssignment(
        store,
        { uid: 'p', email: 'p@nonstopio.com', claims: {} },
        { assignmentId: 'a1' },
      ),
    ).rejects.toMatchObject({ code: 'AUTH_2001' });
    await expect(removeAssignment(store, manager, { assignmentId: 'a1' })).rejects.toMatchObject({
      code: 'AUTH_2001',
    });
    expect(store.deleteAssignment).not.toHaveBeenCalled();
    await expect(removeAssignment(store, admin, { assignmentId: '' })).rejects.toMatchObject({
      code: 'VAL_1002',
    });
  });
});
