import { describe, expect, it, vi } from 'vitest';
import { handleProgressWrite } from '../src/progress';
import type { ProgressStore } from '../src/progress';
import { emptyDelta } from '../src/analytics';

const ts = (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) });
const course = {
  schemaVersion: 3,
  id: 'git',
  title: 'Git',
  summary: '',
  description: '',
  level: 'foundation',
  cover: { theme: 'forest', glyph: 'G' },
  outcomes: [],
  acharyaIds: [],
  acharyaNames: {},
  status: 'published',
  version: 1,
  publishedAt: ts(1),
  rules: { sequential: false, passMark: 0.7, certificate: true, requireVideoWatch: false },
  certificate: { title: 'Git' },
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
const AT = new Date('2026-10-27T00:00:00Z');
const run = (s: ProgressStore, id: string, before: unknown, after: unknown) =>
  handleProgressWrite(s, id, before, after, AT);
const store = (c: unknown = course, issued: string | null = 'NSG-GIT-26-0001'): ProgressStore => ({
  course: vi.fn().mockResolvedValue(c === null ? undefined : c),
  writeDerived: vi.fn().mockResolvedValue(undefined),
  bumpStats: vi.fn().mockResolvedValue(undefined),
  setAssignmentStatus: vi.fn().mockResolvedValue(1),
  signatory: vi.fn().mockResolvedValue({ name: 'A', role: 'K' }),
  issueCertificate: vi.fn().mockResolvedValue(issued),
});

describe('handleProgressWrite', () => {
  it('ignores a deleted document and one that does not fit the shape', async () => {
    const s = store();
    expect(await run(s, 'u_git', progress(), undefined)).toBe('ignored');
    expect(await run(s, 'u_git', undefined, { nope: true })).toBe('ignored');
    expect(s.course).not.toHaveBeenCalled();
  });

  it('counts a start, marks the assignment started and leaves percent 0 alone', async () => {
    const s = store();
    expect(await run(s, 'u_git', undefined, progress())).toBe('unchanged');
    expect(s.bumpStats).toHaveBeenCalledWith(
      'git',
      expect.objectContaining({ started: 1, completed: 0 }),
    );
    expect(s.setAssignmentStatus).toHaveBeenCalledWith('u', 'git', 'started');
    expect(s.writeDerived).not.toHaveBeenCalled();
  });

  it('treats an unreadable previous document as a start', async () => {
    const s = store();
    await run(s, 'u_git', { broken: 1 }, progress());
    expect(s.bumpStats).toHaveBeenCalledWith('git', expect.objectContaining({ started: 1 }));
  });

  it('writes the percent computed from the current course', async () => {
    const s = store();
    const out = await run(s, 'u_git', progress(), progress({ completedItemIds: ['l1', 'gone'] }));
    expect(out).toBe('updated');
    expect(s.writeDerived).toHaveBeenCalledWith('u_git', { percent: 50, completed: false });
    expect(s.bumpStats).toHaveBeenCalledWith('git', {
      ...emptyDelta('2026-W44'),
      lessons: 1,
    });
  });

  it('stamps completion at 100% and, once stamped, counts it exactly once', async () => {
    const s = store();
    const done = progress({ completedItemIds: ['l1', 'l2'], percent: 100 });
    expect(await run(s, 'u_git', progress({ percent: 50 }), done)).toBe('updated');
    expect(s.writeDerived).toHaveBeenCalledWith('u_git', { percent: 100, completed: true });

    const s2 = store();
    const stamped = progress({
      completedItemIds: ['l1', 'l2'],
      percent: 100,
      completedAt: ts(5),
      certificateId: 'NSG-GIT-26-0001',
    });
    expect(await run(s2, 'u_git', done, stamped)).toBe('unchanged');
    expect(s2.bumpStats).toHaveBeenCalledWith(
      'git',
      expect.objectContaining({ completed: 1, assignmentsCompleted: 1, parvasDone: [] }),
    );
    expect(s2.setAssignmentStatus).toHaveBeenCalledWith('u', 'git', 'completed');
  });

  it('does nothing further when the percent is already right and completion was already counted', async () => {
    const s = store();
    const stamped = progress({
      completedItemIds: ['l1', 'l2'],
      percent: 100,
      completedAt: ts(5),
      certificateId: 'NSG-GIT-26-0001',
    });
    expect(await run(s, 'u_git', stamped, stamped)).toBe('unchanged');
    expect(s.bumpStats).not.toHaveBeenCalled();
  });

  it('counts the parva that just became fully done, once', async () => {
    const s = store();
    const before = progress({ completedItemIds: ['l1'], percent: 50 });
    const after = progress({ completedItemIds: ['l1', 'l2'], percent: 50 });
    await run(s, 'u_git', before, after);
    expect(s.bumpStats).toHaveBeenCalledWith(
      'git',
      expect.objectContaining({ parvasDone: [0], lessons: 1, completed: 0 }),
    );
    const again = store();
    const settled = {
      ...after,
      percent: 100,
      completedAt: ts(5),
      certificateId: 'NSG-GIT-26-0001',
    };
    await run(again, 'u_git', settled, { ...settled, lastItemId: 'l2' });
    expect(again.bumpStats).not.toHaveBeenCalled();
  });

  it('ignores progress for a course that no longer exists', async () => {
    expect(await run(store(null), 'u_git', progress(), progress())).toBe('ignored');
  });

  describe('certificates', () => {
    const done = progress({ completedItemIds: ['l1', 'l2'], percent: 100, completedAt: ts(5) });

    it('issues a certificate once the course is complete and says so', async () => {
      const s = store();
      expect(await run(s, 'u_git', done, done)).toBe('updated');
      expect(s.issueCertificate).toHaveBeenCalledWith('u_git', {
        uid: 'u',
        courseId: 'git',
        courseTitle: 'Git',
        courseVersion: 1,
        signatoryName: 'A',
        signatoryRole: 'K',
      });
      expect(s.writeDerived).not.toHaveBeenCalled();
      expect(s.bumpStats).toHaveBeenCalledWith('git', { ...emptyDelta('2026-W44'), certified: 1 });
    });

    it('issues in the same pass that stamps completion', async () => {
      const s = store();
      const before = progress({ completedItemIds: ['l1'], percent: 50 });
      const after = progress({ completedItemIds: ['l1', 'l2'], percent: 50 });
      expect(await run(s, 'u_git', before, after)).toBe('updated');
      expect(s.writeDerived).toHaveBeenCalledWith('u_git', { percent: 100, completed: true });
      expect(s.issueCertificate).toHaveBeenCalledOnce();
    });

    it('stays quiet when another run already issued it', async () => {
      const s = store(course, null);
      expect(await run(s, 'u_git', done, done)).toBe('unchanged');
      expect(s.bumpStats).not.toHaveBeenCalled();
    });

    it('does not issue below 100%, twice, or for a course without certificates', async () => {
      const half = store();
      await run(half, 'u_git', progress(), progress({ completedItemIds: ['l1'] }));
      const had = store();
      await run(had, 'u_git', done, { ...done, certificateId: 'NSG-GIT-26-0001' });
      const off = store({ ...course, rules: { ...course.rules, certificate: false } });
      await run(off, 'u_git', done, done);
      for (const s of [half, had, off]) expect(s.issueCertificate).not.toHaveBeenCalled();
    });
  });
});
