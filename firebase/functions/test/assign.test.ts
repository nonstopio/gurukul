import { assignmentId } from '@gurukul/schema';
import { describe, expect, it, vi } from 'vitest';
import { assignCourses, parseAssignRequest, emailKey } from '../src/assign.js';
import type { AssignStore } from '../src/assign.js';

const kulapati = {
  uid: 'k',
  email: 'k@nonstopio.com',
  name: ' Kavya Rao ',
  claims: { kulapati: true },
};
const published = (title: string) => ({ status: 'published', title });
const id = (course: string, email: string) => assignmentId(course, emailKey(email));

function setup(over: Partial<AssignStore> = {}) {
  const store: AssignStore = {
    courses: vi.fn().mockResolvedValue({ git: published('Git'), sql: published('SQL') }),
    signedInUsers: vi.fn().mockResolvedValue(new Map([['priya@nonstopio.com', 'priya']])),
    existingAssignmentIds: vi.fn().mockResolvedValue(new Set()),
    createAssignments: vi.fn().mockResolvedValue([]),
    bumpAssigned: vi.fn().mockResolvedValue(undefined),
    audit: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
  const mailer = { send: vi.fn().mockResolvedValue(undefined) };
  return { store, mailer, deps: { store, mailer } };
}
const request = (over: Record<string, unknown> = {}) => ({
  courseIds: ['git'],
  emails: ['Priya@NonStopIO.com', 'new@nonstopio.com', 'bad', 'x@gmail.com', 'new@nonstopio.com'],
  dueAt: null,
  mandatory: true,
  reminder: 'weekly',
  notify: false,
  ...over,
});

describe('assignCourses', () => {
  it('assigns, stamps the uid of people who already signed in and reports the summary', async () => {
    const { store, mailer, deps } = setup();
    const out = await assignCourses(deps, kulapati, request({ dueAt: 5000 }));
    expect(out).toEqual({
      summary: {
        signedIn: 1,
        newInvites: 1,
        alreadyAssigned: 0,
        rejected: [
          { email: 'bad', reason: 'Not a valid email address' },
          { email: 'x@gmail.com', reason: 'Not an @nonstopio.com address' },
        ],
      },
      assigned: 2,
      notified: 0,
      failed: [],
    });
    expect(store.signedInUsers).toHaveBeenCalledWith(['priya@nonstopio.com', 'new@nonstopio.com']);
    expect(store.createAssignments).toHaveBeenCalledWith('k', 'Kavya Rao', [
      {
        id: id('git', 'priya@nonstopio.com'),
        email: 'priya@nonstopio.com',
        uid: 'priya',
        courseId: 'git',
        dueAt: 5000,
        mandatory: true,
        reminder: 'weekly',
      },
      {
        id: id('git', 'new@nonstopio.com'),
        email: 'new@nonstopio.com',
        uid: null,
        courseId: 'git',
        dueAt: 5000,
        mandatory: true,
        reminder: 'weekly',
      },
    ]);
    expect(store.bumpAssigned).toHaveBeenCalledWith({ git: 2 });
    expect(store.audit).toHaveBeenCalledWith({
      action: 'assign',
      by: 'k',
      detail: {
        courseIds: ['git'],
        count: 2,
        emails: ['priya@nonstopio.com', 'new@nonstopio.com'],
      },
    });
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('stores no assigner name when the token carries none', async () => {
    const { store, deps } = setup();
    await assignCourses(deps, { ...kulapati, name: undefined }, request());
    expect(store.createAssignments).toHaveBeenCalledWith('k', null, expect.any(Array));
  });

  it('never overwrites an existing assignment and counts pairs across courses', async () => {
    const existing = new Set([id('git', 'priya@nonstopio.com')]);
    const { store, mailer, deps } = setup({
      existingAssignmentIds: vi
        .fn()
        .mockImplementation(async (ids: string[]) => new Set(ids.filter((i) => existing.has(i)))),
    });
    const out = await assignCourses(
      deps,
      kulapati,
      request({ courseIds: ['git', 'sql', 'git'], notify: true, dueAt: Date.UTC(2026, 10, 1) }),
    );
    expect(out.summary).toMatchObject({ signedIn: 1, newInvites: 2, alreadyAssigned: 1 });
    expect(out.summary.rejected).toHaveLength(2);
    expect(out.assigned).toBe(3);
    const written = (store.createAssignments as ReturnType<typeof vi.fn>).mock.calls[0]?.[2];
    expect(written.map((d: { id: string }) => d.id)).not.toContain(
      id('git', 'priya@nonstopio.com'),
    );
    expect(store.bumpAssigned).toHaveBeenCalledWith({ git: 1, sql: 2 });
    // one email per newly assigned person, listing what they got
    expect(out.notified).toBe(2);
    expect(mailer.send).toHaveBeenCalledTimes(2);
    const priya = mailer.send.mock.calls.find((c) => c[0].to === 'priya@nonstopio.com')?.[0];
    expect(priya.text).toContain('/courses/sql');
    expect(priya.text).not.toContain('/courses/git');
    const fresh = mailer.send.mock.calls.find((c) => c[0].to === 'new@nonstopio.com')?.[0];
    expect(fresh.subject).toBe('You have 2 new courses on NonStop Academy');
  });

  it('reports pairs whose batch failed, and bumps, audits and emails only what was written', async () => {
    const { store, mailer, deps } = setup({
      createAssignments: vi.fn().mockResolvedValue([id('sql', 'new@nonstopio.com')]),
    });
    const out = await assignCourses(
      deps,
      kulapati,
      request({ courseIds: ['git', 'sql'], notify: true }),
    );
    expect(out.assigned).toBe(3);
    expect(out.failed).toEqual([{ email: 'new@nonstopio.com', courseId: 'sql' }]);
    expect(store.bumpAssigned).toHaveBeenCalledWith({ git: 2, sql: 1 });
    expect(store.audit).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.objectContaining({ count: 3 }) }),
    );
    const fresh = mailer.send.mock.calls.find((c) => c[0].to === 'new@nonstopio.com')?.[0];
    expect(fresh.text).toContain('/courses/git');
    expect(fresh.text).not.toContain('/courses/sql');
  });

  it('writes no counters and no email when every write failed', async () => {
    const { store, mailer, deps } = setup({
      createAssignments: vi
        .fn()
        .mockImplementation(async (_by: string, _name: string | null, docs: { id: string }[]) =>
          docs.map((d) => d.id),
        ),
    });
    const out = await assignCourses(deps, kulapati, request({ notify: true }));
    expect(out).toMatchObject({ assigned: 0, notified: 0 });
    expect(out.failed).toHaveLength(2);
    expect(store.bumpAssigned).not.toHaveBeenCalled();
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('writes and notifies nothing when everyone is rejected or already assigned', async () => {
    const { store, mailer, deps } = setup({
      existingAssignmentIds: vi.fn().mockImplementation(async (ids: string[]) => new Set(ids)),
    });
    const out = await assignCourses(deps, kulapati, request({ notify: true }));
    expect(out).toMatchObject({ assigned: 0, notified: 0 });
    expect(out.summary.alreadyAssigned).toBe(2);
    expect(store.createAssignments).not.toHaveBeenCalled();
    expect(store.bumpAssigned).not.toHaveBeenCalled();
    expect(store.audit).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { courseIds: ['git'], count: 0, emails: [] } }),
    );
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('names the course that is missing or not published, before writing anything', async () => {
    for (const [found, code] of [
      [{}, 'CRS_2001'],
      [{ git: { status: 'draft', title: 'Git' } }, 'CRS_1001'],
    ] as const) {
      const { store, deps } = setup({ courses: vi.fn().mockResolvedValue(found) });
      await expect(assignCourses(deps, kulapati, request())).rejects.toMatchObject({
        code,
        params: ['git'],
      });
      expect(store.createAssignments).not.toHaveBeenCalled();
      expect(store.audit).not.toHaveBeenCalled();
    }
  });

  it('refuses anyone but a Kulapati', async () => {
    const { store, deps } = setup();
    await expect(
      assignCourses(
        deps,
        { uid: 'x', email: 'x@nonstopio.com', claims: { acharya: true } },
        request(),
      ),
    ).rejects.toMatchObject({ code: 'AUTH_2001' });
    await expect(
      assignCourses(
        deps,
        { uid: 'x', email: 'x@gmail.com', claims: { kulapati: true } },
        request(),
      ),
    ).rejects.toMatchObject({ code: 'AUTH_2001' });
    expect(store.courses).not.toHaveBeenCalled();
  });
});

describe('parseAssignRequest', () => {
  it.each([
    ['no courses', { courseIds: [] }, 'VAL_1004', 'courseIds'],
    [
      '21 courses',
      { courseIds: Array.from({ length: 21 }, (_, i) => `c${i}`) },
      'VAL_1004',
      'courseIds',
    ],
    ['courseIds not a list', { courseIds: 'git' }, 'VAL_1002', 'courseIds'],
    ['courseIds missing', { courseIds: undefined }, 'VAL_1001', 'courseIds'],
    ['a non-string course id', { courseIds: [1] }, 'VAL_1002', 'courseIds'],
    ['an empty course id', { courseIds: [''] }, 'VAL_1002', 'courseIds'],
    ['a course id with a slash', { courseIds: ['a/b'] }, 'VAL_1002', 'courseIds'],
    ['no emails', { emails: [] }, 'VAL_1004', 'emails'],
    ['1001 emails', { emails: new Array(1001).fill('a@nonstopio.com') }, 'VAL_1004', 'emails'],
    ['emails not strings', { emails: [1] }, 'VAL_1002', 'emails'],
    ['emails missing', { emails: undefined }, 'VAL_1001', 'emails'],
    ['dueAt as text', { dueAt: 'soon' }, 'VAL_1002', 'dueAt'],
    ['dueAt not finite', { dueAt: Infinity }, 'VAL_1002', 'dueAt'],
    ['dueAt undefined', { dueAt: undefined }, 'VAL_1001', 'dueAt'],
    ['mandatory as text', { mandatory: 'yes' }, 'VAL_1002', 'mandatory'],
    ['notify missing', { notify: undefined }, 'VAL_1001', 'notify'],
    ['notify as text', { notify: 'yes' }, 'VAL_1002', 'notify'],
    ['an unknown reminder', { reminder: 'daily' }, 'VAL_1002', 'reminder'],
  ])('rejects %s', (_name, over, code, field) => {
    expect(() => parseAssignRequest(request(over))).toThrowError(
      expect.objectContaining({ code, details: { field } }),
    );
  });

  it('accepts the limits, every reminder and a number for dueAt', () => {
    expect(
      parseAssignRequest(
        request({
          courseIds: Array.from({ length: 20 }, (_, i) => `c${i}`),
          emails: new Array(1000).fill('a@nonstopio.com'),
          dueAt: 0,
          reminder: 'beforeDue',
        }),
      ),
    ).toMatchObject({ dueAt: 0, reminder: 'beforeDue' });
    expect(parseAssignRequest(request({ reminder: 'none' })).reminder).toBe('none');
  });
});

describe('emailKey', () => {
  it('is the keyed hex SHA-256 of the text', () => {
    expect(emailKey('abc')).toBe(
      '54c1a670b381ad96071d4394f9eaf45ffe4cca6d5948ac0fa7ef0f507e710f41',
    );
  });
});
