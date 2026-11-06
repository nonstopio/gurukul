import { describe, expect, it, vi } from 'vitest';
import {
  ccFor,
  noticeFor,
  remindLearners,
  runDailyReminders,
  selectManual,
  selectScheduled,
} from '../src/remind.js';
import type { ReminderCandidate, ReminderStore, Selection } from '../src/remind.js';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 27);
const cand = (id: string, over: Partial<ReminderCandidate> = {}): ReminderCandidate => ({
  id,
  email: `${id}@nonstopio.com`,
  courseId: 'git',
  status: 'started',
  mandatory: true,
  reminder: 'weekly',
  assignedAt: NOW - 30 * DAY,
  dueAt: null,
  lastRemindedAt: null,
  teamId: null,
  dueSoonSentAt: null,
  overdueSentAt: null,
  ...over,
});

const ids = (due: Selection['due']) => due.map((p) => p.assignments.map((c) => c.id));

describe('selectManual', () => {
  it('skips completed ones silently and people reminded today as skipped', () => {
    const out = selectManual(
      [
        cand('a'),
        cand('done', { status: 'completed' }),
        cand('recent', { lastRemindedAt: NOW - DAY / 2 }),
        cand('old', { lastRemindedAt: NOW - DAY }),
        cand('nearly', { lastRemindedAt: NOW - 20 * 3_600_000 }),
      ],
      NOW,
    );
    expect(ids(out.due)).toEqual([['a'], ['old'], ['nearly']]);
    expect(out.skipped).toBe(1);
  });

  it('sends one email per person, none to a person reminded today about another course', () => {
    const mine = { email: 'p@nonstopio.com' };
    const out = selectManual(
      [
        cand('git', mine),
        cand('sql', { ...mine, courseId: 'sql' }),
        cand('q', { email: 'q@nonstopio.com' }),
        cand('q-sql', { email: 'q@nonstopio.com', courseId: 'sql', lastRemindedAt: NOW - 1000 }),
      ],
      NOW,
    );
    expect(ids(out.due)).toEqual([['git', 'sql']]);
    expect(out.skipped).toBe(1);
  });

  it('caps the send by people and counts the rest as skipped', () => {
    const out = selectManual([cand('a'), cand('b'), cand('c')], NOW, 2);
    expect(ids(out.due)).toEqual([['a'], ['b']]);
    expect(out.skipped).toBe(1);
  });
});

describe('selectScheduled', () => {
  it('reminds weekly assignments a week after the last reminder, or the assignment', () => {
    const out = selectScheduled(
      [
        cand('never', { assignedAt: NOW - 8 * DAY }),
        cand('fresh', { assignedAt: NOW - 2 * DAY }),
        cand('stale', { lastRemindedAt: NOW - 7 * DAY + 60_000 }),
        cand('lately', { lastRemindedAt: NOW - 6 * DAY }),
      ],
      NOW,
    );
    expect(ids(out.due)).toEqual([['never'], ['stale']]);
    expect(out.skipped).toBe(2);
  });

  it('reminds beforeDue assignments within 3 days of the due date, at most daily', () => {
    const base = { reminder: 'beforeDue' } as const;
    const out = selectScheduled(
      [
        cand('soon', { ...base, dueAt: NOW + 2 * DAY }),
        cand('overdue', { ...base, dueAt: NOW - DAY, lastRemindedAt: NOW - DAY + 60_000 }),
        cand('far', { ...base, dueAt: NOW + 4 * DAY, dueSoonSentAt: NOW - DAY }),
        cand('nodue', { ...base, dueAt: null }),
        cand('today', { ...base, dueAt: NOW + DAY, lastRemindedAt: NOW - 3_600_000 }),
      ],
      NOW,
    );
    expect(ids(out.due)).toEqual([['soon'], ['overdue']]);
    expect(out.skipped).toBe(3);
  });

  it('reminds mandatory assignments only, never completed ones or reminder "none"', () => {
    const out = selectScheduled(
      [
        cand('done', { status: 'completed' }),
        cand('none', { reminder: 'none' }),
        cand('optional', { mandatory: false }),
        cand('a'),
      ],
      NOW,
    );
    expect(ids(out.due)).toEqual([['a']]);
    expect(out.skipped).toBe(0);
  });

  it('sends one email per person, none if an Admin reminded them today, and caps by people', () => {
    const p = { email: 'p@nonstopio.com' };
    const q = { email: 'q@nonstopio.com' };
    const r = { email: 'r@nonstopio.com' };
    const candidates = [
      cand('p-git', p),
      cand('p-sql', { ...p, courseId: 'sql', reminder: 'beforeDue', dueAt: NOW + DAY }),
      cand('q-git', q),
      cand('q-css', { ...q, courseId: 'css', reminder: 'none', lastRemindedAt: NOW - 1000 }),
      cand('r-git', r),
    ];
    const out = selectScheduled(candidates, NOW);
    expect(ids(out.due)).toEqual([['p-git', 'p-sql'], ['r-git']]);
    expect(out.skipped).toBe(1);
    const capped = selectScheduled(candidates, NOW, 1);
    expect(ids(capped.due)).toEqual([['p-git', 'p-sql']]);
    expect(capped.skipped).toBe(2);
  });
});

const admin = { uid: 'k', email: 'k@nonstopio.com', claims: { admin: true } };
function setup(over: Partial<ReminderStore> = {}, enabled = true) {
  const store: ReminderStore = {
    forCourse: vi.fn().mockResolvedValue([cand('a'), cand('b', { lastRemindedAt: NOW - 1000 })]),
    forEmails: vi.fn().mockResolvedValue([cand('c'), cand('d', { courseId: 'sql' })]),
    scheduled: vi.fn().mockResolvedValue([cand('a', { assignedAt: NOW - 9 * DAY })]),
    courseTitles: vi.fn().mockResolvedValue({ git: 'Git basics' }),
    markReminded: vi.fn().mockResolvedValue(undefined),
    markNoticed: vi.fn().mockResolvedValue(undefined),
    teamManagers: vi.fn().mockResolvedValue({}),
    team: vi.fn().mockResolvedValue(undefined),
    remindersEnabled: vi.fn().mockResolvedValue(enabled),
    audit: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
  const mailer = { send: vi.fn().mockResolvedValue(undefined) };
  return { store, mailer, deps: { store, mailer } };
}

describe('remindLearners', () => {
  it('reminds the course’s unfinished learners, skipping one reminded today', async () => {
    const { store, mailer, deps } = setup();
    expect(await remindLearners(deps, admin, { courseId: 'git' }, NOW)).toEqual({
      sent: 1,
      skipped: 1,
    });
    expect(mailer.send).toHaveBeenCalledOnce();
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'a@nonstopio.com',
        subject: expect.stringContaining('Git basics'),
      }),
    );
    expect(store.markReminded).toHaveBeenCalledWith(['a']);
    expect(store.audit).toHaveBeenCalledWith({
      action: 'reminders.send',
      by: 'k',
      detail: { courseId: 'git', sent: 1, skipped: 1 },
    });
  });

  it('reminds the given emails (normalised), narrowed to the course when one is given', async () => {
    const { store, deps } = setup();
    expect(
      await remindLearners(deps, admin, { emails: [' C@NonStopIO.com ', 'c@nonstopio.com'] }, NOW),
    ).toEqual({ sent: 2, skipped: 0 });
    expect(store.forEmails).toHaveBeenCalledWith(['c@nonstopio.com']);
    expect(store.audit).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { courseId: null, sent: 2, skipped: 0 } }),
    );
    const narrowed = setup();
    expect(
      await remindLearners(
        narrowed.deps,
        admin,
        { courseId: 'git', emails: ['c@nonstopio.com'] },
        NOW,
      ),
    ).toEqual({ sent: 1, skipped: 0 });
    expect(narrowed.store.forCourse).not.toHaveBeenCalled();
  });

  it('stamps the people already emailed when a later send fails', async () => {
    const { store, mailer, deps } = setup({
      forEmails: vi.fn().mockResolvedValue([cand('c'), cand('d')]),
    });
    mailer.send.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('mail down'));
    await expect(
      remindLearners(deps, admin, { emails: ['c@nonstopio.com', 'd@nonstopio.com'] }, NOW),
    ).rejects.toThrow('mail down');
    expect(store.markReminded).toHaveBeenCalledWith(['c']);
  });

  it('stamps nobody when the first send fails', async () => {
    const { store, mailer, deps } = setup();
    mailer.send.mockRejectedValue(new Error('mail down'));
    await expect(remindLearners(deps, admin, { courseId: 'git' }, NOW)).rejects.toThrow();
    expect(store.markReminded).not.toHaveBeenCalled();
  });

  it('falls back to the course id when the title is unknown', async () => {
    const { mailer, deps } = setup({ courseTitles: vi.fn().mockResolvedValue({}) });
    await remindLearners(deps, admin, { courseId: 'git' }, NOW);
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Reminder: git is waiting for you' }),
    );
  });

  it('sends nothing, and says so, when everyone was reminded recently', async () => {
    const { store, mailer, deps } = setup({
      forCourse: vi.fn().mockResolvedValue([cand('b', { lastRemindedAt: NOW - 1000 })]),
    });
    expect(await remindLearners(deps, admin, { courseId: 'git' }, NOW)).toEqual({
      sent: 0,
      skipped: 1,
    });
    expect(mailer.send).not.toHaveBeenCalled();
    expect(store.markReminded).not.toHaveBeenCalled();
  });

  it('refuses a non-Admin and bad requests', async () => {
    const { deps } = setup();
    await expect(
      remindLearners(
        deps,
        { uid: 'x', email: 'x@nonstopio.com', claims: {} },
        { courseId: 'git' },
        NOW,
      ),
    ).rejects.toMatchObject({ code: 'AUTH_2001' });
    for (const [bad, code, field] of [
      [{}, 'VAL_1001', 'courseId, emails or teamId'],
      [{ teamId: '' }, 'VAL_1002', 'teamId'],
      [{ courseId: '' }, 'VAL_1002', 'courseId'],
      [{ courseId: 4 }, 'VAL_1002', 'courseId'],
      [{ emails: [] }, 'VAL_1004', 'emails'],
      [{ emails: [1] }, 'VAL_1002', 'emails'],
      [{ emails: 'a@nonstopio.com' }, 'VAL_1002', 'emails'],
      [{ courseId: 'git', emails: new Array(1001).fill('a@nonstopio.com') }, 'VAL_1004', 'emails'],
    ] as const) {
      await expect(remindLearners(deps, admin, bad, NOW)).rejects.toMatchObject({
        code,
        details: { field },
      });
    }
  });
});

describe('runDailyReminders', () => {
  it('does nothing while reminders are switched off', async () => {
    const { store, mailer, deps } = setup({}, false);
    expect(await runDailyReminders(deps, NOW)).toEqual({ sent: 0, skipped: 0 });
    expect(store.scheduled).not.toHaveBeenCalled();
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('sends the due reminders and stamps them', async () => {
    const { store, mailer, deps } = setup();
    expect(await runDailyReminders(deps, NOW)).toEqual({ sent: 1, skipped: 0 });
    expect(mailer.send).toHaveBeenCalledOnce();
    expect(store.markReminded).toHaveBeenCalledWith(['a']);
  });

  it('covers all of a person’s due courses in one email and stamps each', async () => {
    const { store, mailer, deps } = setup({
      scheduled: vi
        .fn()
        .mockResolvedValue([
          cand('a'),
          cand('a-sql', { email: 'a@nonstopio.com', courseId: 'sql' }),
        ]),
      courseTitles: vi.fn().mockResolvedValue({ git: 'Git basics', sql: 'SQL' }),
    });
    expect(await runDailyReminders(deps, NOW)).toEqual({ sent: 1, skipped: 0 });
    expect(mailer.send).toHaveBeenCalledOnce();
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'a@nonstopio.com',
        subject: 'Reminder: 2 courses are waiting for you',
      }),
    );
    expect(store.markReminded).toHaveBeenCalledWith(['a', 'a-sql']);
  });

  it('stamps nothing when nothing is due', async () => {
    const { store, deps } = setup({
      scheduled: vi.fn().mockResolvedValue([cand('x', { assignedAt: NOW })]),
    });
    expect(await runDailyReminders(deps, NOW)).toEqual({ sent: 0, skipped: 1 });
    expect(store.markReminded).not.toHaveBeenCalled();
  });
});

describe('noticeFor', () => {
  it('owes overdue once the due date has passed, and due-soon within 5 days, once each', () => {
    const due = (dueAt: number, over: Partial<ReminderCandidate> = {}) =>
      noticeFor(cand('a', { dueAt, ...over }), NOW);
    expect(due(NOW)).toBe('overdue');
    expect(due(NOW - DAY, { dueSoonSentAt: NOW - 5 * DAY })).toBe('overdue');
    expect(due(NOW - DAY, { overdueSentAt: NOW - 1000 })).toBeNull();
    expect(due(NOW + 5 * DAY)).toBe('dueSoon');
    expect(due(NOW + 1)).toBe('dueSoon');
    expect(due(NOW + 5 * DAY + 1)).toBeNull();
    expect(due(NOW + DAY, { dueSoonSentAt: NOW - DAY })).toBeNull();
  });

  it('owes nothing without a due date, for reminder "none" or a finished course', () => {
    expect(noticeFor(cand('a'), NOW)).toBeNull();
    expect(noticeFor(cand('a', { dueAt: NOW - DAY, reminder: 'none' }), NOW)).toBeNull();
    expect(noticeFor(cand('a', { dueAt: NOW - DAY, status: 'completed' }), NOW)).toBeNull();
  });
});

describe('selectScheduled deadline notices', () => {
  it('adds notices for optional assignments too and names each one owed', () => {
    const p = { email: 'p@nonstopio.com' };
    const out = selectScheduled(
      [
        cand('late', { ...p, mandatory: false, dueAt: NOW - DAY }),
        cand('soon', { ...p, courseId: 'sql', reminder: 'beforeDue', dueAt: NOW + 2 * DAY }),
        cand('weekly', { ...p, courseId: 'css', assignedAt: NOW - 8 * DAY }),
        cand('quiet', { email: 'q@nonstopio.com', mandatory: false, dueAt: NOW + 9 * DAY }),
      ],
      NOW,
    );
    expect(out.due).toHaveLength(1);
    expect(ids(out.due)).toEqual([['late', 'soon', 'weekly']]);
    expect(out.due[0]?.notices).toEqual({ late: 'overdue', soon: 'dueSoon' });
    expect(out.skipped).toBe(0);
  });

  it('holds a notice for tomorrow when the person was reminded today', () => {
    const out = selectScheduled(
      [cand('late', { mandatory: false, dueAt: NOW - DAY, lastRemindedAt: NOW - 1000 })],
      NOW,
    );
    expect(out.due).toEqual([]);
    expect(out.skipped).toBe(1);
  });

  it('gives a plain reminder no notices', () => {
    expect(selectManual([cand('a', { dueAt: NOW - DAY })], NOW).due[0]?.notices).toEqual({});
  });
});

describe('ccFor', () => {
  const person = (
    assignments: ReminderCandidate[],
    notices: Record<string, 'dueSoon' | 'overdue'>,
  ) => ({
    email: 'p@nonstopio.com',
    assignments,
    notices,
  });

  it('copies the managers of the notice assignments’ teams, deduped and without the learner', () => {
    const cc = ccFor(
      person(
        [
          cand('a', { teamId: 'sales' }),
          cand('b', { teamId: 'ops' }),
          cand('c', { teamId: 'hr' }),
          cand('d', { teamId: null }),
          cand('e', { teamId: 'gone' }),
        ],
        { a: 'overdue', b: 'dueSoon', d: 'overdue', e: 'dueSoon' },
      ),
      {
        sales: ['m@nonstopio.com', 'p@nonstopio.com'],
        ops: ['m@nonstopio.com', 'n@nonstopio.com'],
        hr: ['h@nonstopio.com'],
      },
    );
    expect(cc).toEqual(['m@nonstopio.com', 'n@nonstopio.com']);
  });

  it('copies at most 10 people', () => {
    const managers = { sales: Array.from({ length: 12 }, (_, i) => `m${i}@nonstopio.com`) };
    const cc = ccFor(person([cand('a', { teamId: 'sales' })], { a: 'overdue' }), managers);
    expect(cc).toHaveLength(10);
  });
});

describe('runDailyReminders deadline email', () => {
  const p = { email: 'p@nonstopio.com' };
  const scheduled = [
    cand('late', { ...p, mandatory: false, dueAt: NOW - DAY, teamId: 'sales' }),
    cand('soon', { ...p, courseId: 'sql', dueAt: NOW + 2 * DAY, teamId: null }),
    cand('weekly', { ...p, courseId: 'css', assignedAt: NOW - 8 * DAY, teamId: 'ops' }),
    cand('other', { email: 'q@nonstopio.com', assignedAt: NOW - 8 * DAY, teamId: 'ops' }),
  ];

  it('sends the deadline email with the team managers in CC, and stamps the notices', async () => {
    const { store, mailer, deps } = setup({
      scheduled: vi.fn().mockResolvedValue(scheduled),
      courseTitles: vi.fn().mockResolvedValue({ git: 'Git basics', sql: 'SQL', css: 'CSS' }),
      teamManagers: vi.fn().mockResolvedValue({ sales: ['m@nonstopio.com'] }),
    });
    expect(await runDailyReminders(deps, NOW)).toEqual({ sent: 2, skipped: 0 });
    expect(store.teamManagers).toHaveBeenCalledWith(['sales']);
    const [deadline, plain] = mailer.send.mock.calls.map(([m]) => m);
    expect(deadline).toMatchObject({ to: 'p@nonstopio.com', cc: ['m@nonstopio.com'] });
    expect(deadline.text.indexOf('Git basics')).toBeLessThan(deadline.text.indexOf('CSS'));
    expect(deadline.text.indexOf('SQL')).toBeLessThan(deadline.text.indexOf('CSS'));
    expect(plain).toMatchObject({ to: 'q@nonstopio.com' });
    expect(plain).not.toHaveProperty('cc');
    expect(store.markReminded).toHaveBeenCalledWith(['late', 'soon', 'weekly', 'other']);
    expect(store.markNoticed).toHaveBeenCalledWith({ late: 'overdue', soon: 'dueSoon' });
  });

  it('reads no managers when no notice came through a team, and copies nobody', async () => {
    const { store, mailer, deps } = setup({
      scheduled: vi.fn().mockResolvedValue([scheduled[1]]),
    });
    await runDailyReminders(deps, NOW);
    expect(store.teamManagers).not.toHaveBeenCalled();
    expect(mailer.send.mock.calls[0]?.[0]).not.toHaveProperty('cc');
    expect(store.markNoticed).toHaveBeenCalledWith({ soon: 'dueSoon' });
  });

  it('stamps no notice of a person whose email was not sent', async () => {
    const { store, mailer, deps } = setup({ scheduled: vi.fn().mockResolvedValue(scheduled) });
    mailer.send.mockRejectedValueOnce(new Error('mail down'));
    await expect(runDailyReminders(deps, NOW)).rejects.toThrow('mail down');
    expect(store.markReminded).not.toHaveBeenCalled();
    expect(store.markNoticed).not.toHaveBeenCalled();
  });
});

describe('remindLearners for a team', () => {
  const manager = { uid: 'm', email: 'M@nonstopio.com', claims: { manager: true } };
  const sales = {
    id: 'sales',
    name: 'Sales',
    memberEmails: ['C@nonstopio.com', 'd@nonstopio.com'],
    managerEmails: ['m@nonstopio.com'],
  };

  it('lets a manager remind the members of a team they manage, and audits the team', async () => {
    const { store, mailer, deps } = setup({ team: vi.fn().mockResolvedValue(sales) });
    expect(await remindLearners(deps, manager, { teamId: 'sales' }, NOW)).toEqual({
      sent: 2,
      skipped: 0,
    });
    expect(store.team).toHaveBeenCalledWith('sales');
    expect(store.forEmails).toHaveBeenCalledWith(['c@nonstopio.com', 'd@nonstopio.com']);
    expect(mailer.send).toHaveBeenCalledTimes(2);
    expect(store.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        by: 'm',
        detail: { courseId: null, teamId: 'sales', sent: 2, skipped: 0 },
      }),
    );
  });

  it('narrows a course or a list of emails to the team', async () => {
    const course = setup({ team: vi.fn().mockResolvedValue(sales) });
    expect(
      await remindLearners(course.deps, manager, { teamId: 'sales', courseId: 'sql' }, NOW),
    ).toEqual({ sent: 1, skipped: 0 });
    expect(course.store.forCourse).not.toHaveBeenCalled();
    const listed = setup({ team: vi.fn().mockResolvedValue(sales) });
    await remindLearners(
      listed.deps,
      admin,
      { teamId: 'sales', emails: ['d@nonstopio.com', 'x@nonstopio.com'] },
      NOW,
    );
    expect(listed.store.forEmails).toHaveBeenCalledWith(['d@nonstopio.com']);
    const outside = setup({ team: vi.fn().mockResolvedValue(sales) });
    expect(
      await remindLearners(
        outside.deps,
        admin,
        { teamId: 'sales', emails: ['x@nonstopio.com'] },
        NOW,
      ),
    ).toEqual({ sent: 0, skipped: 0 });
    expect(outside.store.forEmails).not.toHaveBeenCalled();
  });

  it('refuses a manager without a team, with a team they do not manage, and an unknown team', async () => {
    const { deps } = setup({ team: vi.fn().mockResolvedValue({ ...sales, managerEmails: [] }) });
    await expect(remindLearners(deps, manager, { courseId: 'git' }, NOW)).rejects.toMatchObject({
      code: 'AUTH_2001',
      details: { field: 'teamId' },
    });
    await expect(remindLearners(deps, manager, { teamId: 'sales' }, NOW)).rejects.toMatchObject({
      code: 'AUTH_2001',
      details: { teamId: 'sales' },
    });
    const missing = setup();
    await expect(
      remindLearners(missing.deps, admin, { teamId: 'nope' }, NOW),
    ).rejects.toMatchObject({ code: 'VAL_1003', details: { field: 'teamId' } });
  });
});
