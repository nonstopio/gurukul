import { describe, expect, it, vi } from 'vitest';
import { remindLearners, runDailyReminders, selectManual, selectScheduled } from '../src/remind.js';
import type { ReminderCandidate, ReminderStore } from '../src/remind.js';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 27);
const cand = (id: string, over: Partial<ReminderCandidate> = {}): ReminderCandidate => ({
  id,
  email: `${id}@nonstopio.com`,
  courseId: 'git',
  status: 'started',
  reminder: 'weekly',
  assignedAt: NOW - 30 * DAY,
  dueAt: null,
  lastRemindedAt: null,
  ...over,
});

describe('selectManual', () => {
  it('skips completed ones silently and recent ones as skipped', () => {
    const out = selectManual(
      [
        cand('a'),
        cand('done', { status: 'completed' }),
        cand('recent', { lastRemindedAt: NOW - DAY / 2 }),
        cand('old', { lastRemindedAt: NOW - DAY }),
      ],
      NOW,
    );
    expect(out.due.map((c) => c.id)).toEqual(['a', 'old']);
    expect(out.skipped).toBe(1);
  });

  it('caps the send and counts the rest as skipped', () => {
    const out = selectManual([cand('a'), cand('b'), cand('c')], NOW, 2);
    expect(out.due.map((c) => c.id)).toEqual(['a', 'b']);
    expect(out.skipped).toBe(1);
  });
});

describe('selectScheduled', () => {
  it('reminds weekly assignments seven days after the last reminder, or the assignment', () => {
    const out = selectScheduled(
      [
        cand('never', { assignedAt: NOW - 8 * DAY }),
        cand('fresh', { assignedAt: NOW - 2 * DAY }),
        cand('stale', { lastRemindedAt: NOW - 7 * DAY }),
        cand('lately', { lastRemindedAt: NOW - 6 * DAY }),
      ],
      NOW,
    );
    expect(out.due.map((c) => c.id)).toEqual(['never', 'stale']);
    expect(out.skipped).toBe(2);
  });

  it('reminds beforeDue assignments within 3 days of the due date, at most daily', () => {
    const base = { reminder: 'beforeDue' } as const;
    const out = selectScheduled(
      [
        cand('soon', { ...base, dueAt: NOW + 2 * DAY }),
        cand('overdue', { ...base, dueAt: NOW - DAY }),
        cand('far', { ...base, dueAt: NOW + 4 * DAY }),
        cand('nodue', { ...base, dueAt: null }),
        cand('today', { ...base, dueAt: NOW + DAY, lastRemindedAt: NOW - 3_600_000 }),
      ],
      NOW,
    );
    expect(out.due.map((c) => c.id)).toEqual(['soon', 'overdue']);
    expect(out.skipped).toBe(3);
  });

  it('never reminds completed assignments or reminder "none", and honours the cap', () => {
    const out = selectScheduled(
      [
        cand('done', { status: 'completed' }),
        cand('none', { reminder: 'none' }),
        cand('a'),
        cand('b'),
      ],
      NOW,
      1,
    );
    expect(out.due.map((c) => c.id)).toEqual(['a']);
    expect(out.skipped).toBe(1);
  });
});

const kulapati = { uid: 'k', email: 'k@nonstopio.com', claims: { kulapati: true } };
function setup(over: Partial<ReminderStore> = {}, enabled = true) {
  const store: ReminderStore = {
    forCourse: vi.fn().mockResolvedValue([cand('a'), cand('b', { lastRemindedAt: NOW - 1000 })]),
    forEmails: vi.fn().mockResolvedValue([cand('c'), cand('d', { courseId: 'sql' })]),
    scheduled: vi.fn().mockResolvedValue([cand('a', { assignedAt: NOW - 9 * DAY })]),
    courseTitles: vi.fn().mockResolvedValue({ git: 'Git basics' }),
    markReminded: vi.fn().mockResolvedValue(undefined),
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
    expect(await remindLearners(deps, kulapati, { courseId: 'git' }, NOW)).toEqual({
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
      await remindLearners(
        deps,
        kulapati,
        { emails: [' C@NonStopIO.com ', 'c@nonstopio.com'] },
        NOW,
      ),
    ).toEqual({ sent: 2, skipped: 0 });
    expect(store.forEmails).toHaveBeenCalledWith(['c@nonstopio.com']);
    expect(store.audit).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { courseId: null, sent: 2, skipped: 0 } }),
    );
    const narrowed = setup();
    expect(
      await remindLearners(
        narrowed.deps,
        kulapati,
        { courseId: 'git', emails: ['c@nonstopio.com'] },
        NOW,
      ),
    ).toEqual({ sent: 1, skipped: 0 });
    expect(narrowed.store.forCourse).not.toHaveBeenCalled();
  });

  it('falls back to the course id when the title is unknown', async () => {
    const { mailer, deps } = setup({ courseTitles: vi.fn().mockResolvedValue({}) });
    await remindLearners(deps, kulapati, { courseId: 'git' }, NOW);
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Reminder: git is waiting for you' }),
    );
  });

  it('sends nothing, and says so, when everyone was reminded recently', async () => {
    const { store, mailer, deps } = setup({
      forCourse: vi.fn().mockResolvedValue([cand('b', { lastRemindedAt: NOW - 1000 })]),
    });
    expect(await remindLearners(deps, kulapati, { courseId: 'git' }, NOW)).toEqual({
      sent: 0,
      skipped: 1,
    });
    expect(mailer.send).not.toHaveBeenCalled();
    expect(store.markReminded).not.toHaveBeenCalled();
  });

  it('refuses a non-Kulapati and bad requests', async () => {
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
      [{}, 'VAL_1001', 'courseId or emails'],
      [{ courseId: '' }, 'VAL_1002', 'courseId'],
      [{ courseId: 4 }, 'VAL_1002', 'courseId'],
      [{ emails: [] }, 'VAL_1004', 'emails'],
      [{ emails: [1] }, 'VAL_1002', 'emails'],
      [{ emails: 'a@nonstopio.com' }, 'VAL_1002', 'emails'],
      [{ courseId: 'git', emails: new Array(1001).fill('a@nonstopio.com') }, 'VAL_1004', 'emails'],
    ] as const) {
      await expect(remindLearners(deps, kulapati, bad, NOW)).rejects.toMatchObject({
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

  it('stamps nothing when nothing is due', async () => {
    const { store, deps } = setup({
      scheduled: vi.fn().mockResolvedValue([cand('x', { assignedAt: NOW })]),
    });
    expect(await runDailyReminders(deps, NOW)).toEqual({ sent: 0, skipped: 1 });
    expect(store.markReminded).not.toHaveBeenCalled();
  });
});
