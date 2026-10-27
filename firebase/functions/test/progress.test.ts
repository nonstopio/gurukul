import { describe, expect, it, vi } from 'vitest';
import { handleProgressWrite } from '../src/progress';
import type { ProgressStore } from '../src/progress';

const ts = (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) });
const course = {
  schemaVersion: 1,
  id: 'git',
  title: 'Git',
  summary: '',
  description: '',
  level: 'foundation',
  cover: { theme: 'forest', glyph: 'G' },
  outcomes: [],
  acharyaIds: [],
  status: 'published',
  version: 1,
  publishedAt: ts(1),
  rules: { sequential: false, passMark: 0.7, certificate: true, requireVideoWatch: false },
  certificate: { title: 'Git', signatoryName: 'A', signatoryRole: 'K' },
  parvas: [
    {
      id: 'p1',
      title: 'P',
      items: ['l1', 'l2'].map((id) => ({
        type: 'lesson',
        id,
        title: id,
        minutes: 1,
        layout: 'stacked',
        completeWhen: 'manual',
        blocks: [],
      })),
    },
  ],
  estimatedMinutes: 2,
};
const progress = (over: object = {}) => ({
  uid: 'u',
  courseId: 'git',
  courseVersion: 1,
  startedAt: ts(1),
  lastItemId: null,
  lastActiveAt: ts(1),
  completedItemIds: [],
  pariksha: {},
  percent: 0,
  completedAt: null,
  certificateId: null,
  ...over,
});
const store = (c: unknown = course): ProgressStore => ({
  course: vi.fn().mockResolvedValue(c === null ? undefined : c),
  writeDerived: vi.fn().mockResolvedValue(undefined),
  bumpStats: vi.fn().mockResolvedValue(undefined),
  setAssignmentStatus: vi.fn().mockResolvedValue(undefined),
});

describe('handleProgressWrite', () => {
  it('ignores a deleted document and one that does not fit the shape', async () => {
    const s = store();
    expect(await handleProgressWrite(s, 'u_git', progress(), undefined)).toBe('ignored');
    expect(await handleProgressWrite(s, 'u_git', undefined, { nope: true })).toBe('ignored');
    expect(s.course).not.toHaveBeenCalled();
  });

  it('counts a start, marks the assignment started and leaves percent 0 alone', async () => {
    const s = store();
    expect(await handleProgressWrite(s, 'u_git', undefined, progress())).toBe('unchanged');
    expect(s.bumpStats).toHaveBeenCalledWith('git', { started: 1, completed: 0 });
    expect(s.setAssignmentStatus).toHaveBeenCalledWith('u', 'git', 'started');
    expect(s.writeDerived).not.toHaveBeenCalled();
  });

  it('treats an unreadable previous document as a start', async () => {
    const s = store();
    await handleProgressWrite(s, 'u_git', { broken: 1 }, progress());
    expect(s.bumpStats).toHaveBeenCalledWith('git', { started: 1, completed: 0 });
  });

  it('writes the percent computed from the current course', async () => {
    const s = store();
    const out = await handleProgressWrite(
      s,
      'u_git',
      progress(),
      progress({ completedItemIds: ['l1', 'gone'] }),
    );
    expect(out).toBe('updated');
    expect(s.writeDerived).toHaveBeenCalledWith('u_git', { percent: 50, completed: false });
    expect(s.bumpStats).not.toHaveBeenCalled();
  });

  it('stamps completion at 100% and, once stamped, counts it exactly once', async () => {
    const s = store();
    const done = progress({ completedItemIds: ['l1', 'l2'], percent: 100 });
    expect(await handleProgressWrite(s, 'u_git', progress({ percent: 50 }), done)).toBe('updated');
    expect(s.writeDerived).toHaveBeenCalledWith('u_git', { percent: 100, completed: true });

    const s2 = store();
    const stamped = progress({ completedItemIds: ['l1', 'l2'], percent: 100, completedAt: ts(5) });
    expect(await handleProgressWrite(s2, 'u_git', done, stamped)).toBe('unchanged');
    expect(s2.bumpStats).toHaveBeenCalledWith('git', { started: 0, completed: 1 });
    expect(s2.setAssignmentStatus).toHaveBeenCalledWith('u', 'git', 'completed');
  });

  it('does nothing further when the percent is already right and completion was already counted', async () => {
    const s = store();
    const stamped = progress({ completedItemIds: ['l1', 'l2'], percent: 100, completedAt: ts(5) });
    expect(await handleProgressWrite(s, 'u_git', stamped, stamped)).toBe('unchanged');
    expect(s.bumpStats).not.toHaveBeenCalled();
  });

  it('ignores progress for a course that no longer exists', async () => {
    expect(await handleProgressWrite(store(null), 'u_git', progress(), progress())).toBe('ignored');
  });
});
