import { describe, expect, it } from 'vitest';
import { courseStatsSchema, orgStatsSchema } from '@gurukul/schema';
import {
  averageDays,
  buildLearnerRows,
  filterByRole,
  funnelSteps,
  hardestQuestions,
  isOverdue,
  rowsFromAssignments,
  pct,
  weeklySeries,
} from '../src/console/model';
import type { AssignmentFull, UserRow } from '../src/console/types';
import { progressRow } from './fake-data';

const now = new Date('2026-03-10T00:00:00Z');
const user = (n: number, over: Partial<UserRow> = {}): UserRow => ({
  uid: `u${n}`,
  email: `u${n}@nonstopio.com`,
  displayName: `User ${n}`,
  team: 'QA',
  roles: ['shishya'],
  grantedCourseIds: [],
  createdAt: null,
  ...over,
});
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

describe('isOverdue', () => {
  it('needs a past due date and an unfinished assignment', () => {
    expect(isOverdue({ dueAt: new Date('2026-03-01'), status: 'started' }, now)).toBe(true);
    expect(isOverdue({ dueAt: new Date('2026-03-01'), status: 'completed' }, now)).toBe(false);
    expect(isOverdue({ dueAt: new Date('2026-04-01'), status: 'assigned' }, now)).toBe(false);
    expect(isOverdue({ dueAt: null, status: 'assigned' }, now)).toBe(false);
  });
});

describe('buildLearnerRows', () => {
  const rows = buildLearnerRows(
    [user(1), user(2, { displayName: '', roles: ['shishya', 'acharya'], team: null })],
    [
      asg('u1@nonstopio.com', { uid: 'u1', status: 'completed' }),
      asg('u1@nonstopio.com', { uid: 'u1', courseId: 'sql', dueAt: new Date('2026-03-01') }),
      asg('new@nonstopio.com', { dueAt: new Date('2026-03-02') }),
      asg('new@nonstopio.com', { courseId: 'sql', assignedAt: null }),
      asg('lonely@nonstopio.com', { assignedAt: null }),
    ],
    [
      {
        ...progressRow({ courseId: 'git', percent: 100, lastActiveAt: new Date('2026-03-05') }),
        uid: 'u1',
      },
      {
        ...progressRow({ courseId: 'sql', percent: 50, lastActiveAt: new Date('2026-03-08') }),
        uid: 'u1',
      },
      { ...progressRow({ courseId: 'git', percent: 10, lastActiveAt: null }), uid: 'other' },
    ],
    now,
  );

  it('joins progress for people who signed in', () => {
    expect(rows[0]).toMatchObject({
      uid: 'u1',
      name: 'User 1',
      assigned: 2,
      done: 1,
      percent: 75,
      overdue: true,
      status: 'active',
    });
    expect(rows[0]?.lastActive).toEqual(new Date('2026-03-08'));
    expect(rows[1]).toMatchObject({
      name: 'u2@nonstopio.com',
      assigned: 0,
      percent: 0,
      lastActive: null,
      overdue: false,
    });
  });

  it('adds pending invites for emails with no account, with the latest invite date', () => {
    const invited = rows.filter((r) => r.status === 'invited');
    expect(invited.map((r) => r.email)).toEqual(['new@nonstopio.com', 'lonely@nonstopio.com']);
    expect(invited[0]).toMatchObject({
      uid: null,
      assigned: 2,
      overdue: true,
      invitedAt: new Date('2026-03-01'),
    });
    expect(invited[1]?.invitedAt).toBeNull();
  });

  it('treats a course with no progress as 0%, and a missing activity date as never active', () => {
    const rows = buildLearnerRows(
      [user(1)],
      [asg('u1@nonstopio.com', { uid: 'u1' })],
      [{ ...progressRow({ courseId: 'other', lastActiveAt: null }), uid: 'u1' }],
      now,
    );
    expect(rows[0]).toMatchObject({ percent: 0, lastActive: null });
  });

  it('can leave pending invites out, for a page of signed-in people', () => {
    const r = buildLearnerRows([user(1)], [asg('new@nonstopio.com')], [], now, false);
    expect(r.map((x) => x.status)).toEqual(['active']);
  });

  it('does not list an email that has an account as pending', () => {
    const r = buildLearnerRows([user(1)], [asg('u1@nonstopio.com')], [], now);
    expect(r.map((x) => x.status)).toEqual(['active']);
  });
});

describe('filterByRole', () => {
  it('keeps people holding a role, or everyone for an empty role', () => {
    const rows = buildLearnerRows(
      [user(1, { roles: ['shishya', 'acharya'] }), user(2)],
      [],
      [],
      now,
    );
    expect(filterByRole(rows, 'acharya').map((r) => r.uid)).toEqual(['u1']);
    expect(filterByRole(rows, '')).toHaveLength(2);
  });
});

describe('analytics helpers', () => {
  it('fills a 12-week series with zeros for quiet weeks', () => {
    const series = weeklySeries(orgStatsSchema.parse({ weekly: { '2026-W11': 9 } }), now, 3);
    expect(series).toEqual([
      { label: 'W09', value: 0 },
      { label: 'W10', value: 0 },
      { label: 'W11', value: 9 },
    ]);
    expect(weeklySeries(orgStatsSchema.parse({}), now)).toHaveLength(12);
  });

  it('builds the funnel from assigned to completed, zero for missing parvas', () => {
    const stats = courseStatsSchema.parse({
      assigned: 10,
      started: 8,
      completed: 3,
      parvaCompletions: [7],
    });
    expect(funnelSteps(stats, ['Basics', 'Branching'])).toEqual([
      { label: 'Assigned', value: 10 },
      { label: 'Started', value: 8 },
      { label: 'Basics', value: 7 },
      { label: 'Branching', value: 0 },
      { label: 'Completed', value: 3 },
    ]);
  });

  it('ranks the hardest questions, ignoring thinly attempted ones', () => {
    const stats = courseStatsSchema.parse({
      questionFirstTry: {
        a: { correct: 1, total: 4 },
        b: { correct: 3, total: 4 },
        c: { correct: 0, total: 1 },
        d: { correct: 1, total: 4 },
        e: { correct: 4, total: 4 },
        f: { correct: 2, total: 3 },
      },
    });
    expect(hardestQuestions(stats).map((q) => q.questionId)).toEqual(['a', 'd', 'f']);
    expect(hardestQuestions(stats, 1)[0]).toEqual({ questionId: 'a', percent: 25, tries: 4 });
    expect(hardestQuestions(courseStatsSchema.parse({}))).toEqual([]);
  });

  it('computes percentages and average days safely', () => {
    expect(pct(1, 3)).toBe(33);
    expect(pct(1, 0)).toBeNull();
    expect(averageDays({ finishDaysSum: 25, completed: 4 })).toBe(6.3);
    expect(averageDays({ finishDaysSum: 0, completed: 0 })).toBeNull();
  });
});

describe('rowsFromAssignments', () => {
  it('groups by email, marking people with accounts active and the rest invited', () => {
    const rows = rowsFromAssignments(
      [
        asg('a@nonstopio.com', { uid: 'ua', status: 'completed' }),
        asg('a@nonstopio.com', { uid: 'ua', courseId: 'sql', dueAt: new Date('2026-03-01') }),
        asg('b@nonstopio.com', { assignedAt: null }),
      ],
      now,
    );
    expect(rows[0]).toMatchObject({
      key: 'ua',
      uid: 'ua',
      status: 'active',
      assigned: 2,
      done: 1,
      overdue: true,
    });
    expect(rows[0]?.invitedAt).toEqual(new Date('2026-03-01'));
    expect(rows[1]).toMatchObject({
      key: 'b@nonstopio.com',
      uid: null,
      status: 'invited',
      invitedAt: null,
    });
    expect(rowsFromAssignments([], now)).toEqual([]);
  });
});
