import { EDUCATOR_COURSE_ID, assignmentId } from '@gurukul/schema';
import { describe, expect, it, vi } from 'vitest';
import { assignCourses, parseAssignRequest, emailKey } from '../src/assign.js';
import type { AssignStore } from '../src/assign.js';

const admin = {
  uid: 'k',
  email: 'k@nonstopio.com',
  name: ' Kavya Rao ',
  claims: { admin: true },
};
const FUTURE = Date.UTC(2100, 0, 1);
const published = (title: string) => ({ status: 'published', title });
const id = (course: string, email: string) => assignmentId(course, emailKey(email));

function setup(over: Partial<AssignStore> = {}) {
  const store: AssignStore = {
    courses: vi.fn().mockResolvedValue({ git: published('Git'), sql: published('SQL') }),
    audiences: vi.fn().mockResolvedValue(new Map()),
    signedInUsers: vi.fn().mockResolvedValue(new Map([['priya@nonstopio.com', 'priya']])),
    existingAssignmentIds: vi.fn().mockResolvedValue(new Set()),
    profileName: vi.fn().mockResolvedValue(null),
    createAssignments: vi.fn().mockResolvedValue([]),
    bumpAssigned: vi.fn().mockResolvedValue(undefined),
    audit: vi.fn().mockResolvedValue(undefined),
    addTeamMembers: vi.fn().mockResolvedValue(undefined),
    teams: vi.fn().mockResolvedValue(new Map()),
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
    const out = await assignCourses(deps, admin, request({ dueAt: FUTURE }));
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
        dueAt: FUTURE,
        mandatory: true,
        reminder: 'weekly',
        teamId: null,
      },
      {
        id: id('git', 'new@nonstopio.com'),
        email: 'new@nonstopio.com',
        uid: null,
        courseId: 'git',
        dueAt: FUTURE,
        mandatory: true,
        reminder: 'weekly',
        teamId: null,
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

  it('falls back to the profile name when the token carries none', async () => {
    const { store, deps } = setup({ profileName: vi.fn().mockResolvedValue(' Kavya R ') });
    await assignCourses(deps, { ...admin, name: undefined }, request());
    expect(store.profileName).toHaveBeenCalledWith('k');
    expect(store.createAssignments).toHaveBeenCalledWith('k', 'Kavya R', expect.any(Array));
  });

  it('stores no assigner name when neither the token nor the profile has one', async () => {
    const { store, deps } = setup({ profileName: vi.fn().mockResolvedValue('  ') });
    await assignCourses(deps, { ...admin, name: ' ' }, request());
    expect(store.createAssignments).toHaveBeenCalledWith('k', null, expect.any(Array));
  });

  it('reads no profile when the token names the caller', async () => {
    const { store, deps } = setup();
    await assignCourses(deps, admin, request());
    expect(store.profileName).not.toHaveBeenCalled();
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
      admin,
      request({ courseIds: ['git', 'sql', 'git'], notify: true, dueAt: FUTURE }),
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
      admin,
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
    const out = await assignCourses(deps, admin, request({ notify: true }));
    expect(out).toMatchObject({ assigned: 0, notified: 0 });
    expect(out.failed).toHaveLength(2);
    expect(store.bumpAssigned).not.toHaveBeenCalled();
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('writes and notifies nothing when everyone is rejected or already assigned', async () => {
    const { store, mailer, deps } = setup({
      existingAssignmentIds: vi.fn().mockImplementation(async (ids: string[]) => new Set(ids)),
    });
    const out = await assignCourses(deps, admin, request({ notify: true }));
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
      await expect(assignCourses(deps, admin, request())).rejects.toMatchObject({
        code,
        params: ['git'],
      });
      expect(store.createAssignments).not.toHaveBeenCalled();
      expect(store.audit).not.toHaveBeenCalled();
    }
  });

  it('refuses anyone but an Admin', async () => {
    const { store, deps } = setup();
    await expect(
      assignCourses(
        deps,
        { uid: 'x', email: 'x@nonstopio.com', claims: { educator: true } },
        request(),
      ),
    ).rejects.toMatchObject({ code: 'AUTH_2001' });
    await expect(
      assignCourses(deps, { uid: 'x', email: 'x@gmail.com', claims: { admin: true } }, request()),
    ).rejects.toMatchObject({ code: 'AUTH_2001' });
    expect(store.courses).not.toHaveBeenCalled();
  });
});

describe('the Educator course', () => {
  it('is assigned to anyone, who then joins its team; nobody joins for other courses', async () => {
    const { store, deps } = setup({
      courses: vi.fn().mockResolvedValue({
        'educator-onboarding': {
          ...published('Becoming a Gurukul Educator'),
          access: { visibility: 'teams', visibleTeamIds: ['educator-candidates'] },
        },
        git: published('Git'),
      }),
      audiences: vi.fn().mockResolvedValue(new Map([['priya', { teamIds: [], staff: false }]])),
    });
    const out = await assignCourses(
      deps,
      admin,
      request({ courseIds: ['educator-onboarding', 'git'] }),
    );
    expect(out.failed).toEqual([]);
    expect(store.addTeamMembers).toHaveBeenCalledWith('Educator candidates', [
      'priya@nonstopio.com',
      'new@nonstopio.com',
    ]);

    const other = setup();
    await assignCourses(other.deps, admin, request());
    expect(other.store.addTeamMembers).not.toHaveBeenCalled();
  });

  it('puts someone already assigned back on the team when assigned again', async () => {
    const { store, deps } = setup({
      courses: vi.fn().mockResolvedValue({
        'educator-onboarding': published('Becoming a Gurukul Educator'),
      }),
      existingAssignmentIds: vi
        .fn()
        .mockResolvedValue(new Set([id('educator-onboarding', 'priya@nonstopio.com')])),
    });
    const out = await assignCourses(
      deps,
      admin,
      request({ courseIds: ['educator-onboarding'], emails: ['priya@nonstopio.com'] }),
    );
    expect(out.assigned).toBe(0);
    expect(store.addTeamMembers).toHaveBeenCalledWith('Educator candidates', [
      'priya@nonstopio.com',
    ]);
  });
});

describe('a course limited to teams or staff', () => {
  const restricted = (visibility: 'teams' | 'staff') => ({
    git: {
      ...published('Git'),
      access: { visibility, visibleTeamIds: visibility === 'teams' ? ['qa'] : [] },
    },
    sql: published('SQL'),
  });

  it('is not assigned to a signed-in person it would not open for, and says so', async () => {
    const { store, deps } = setup({
      courses: vi.fn().mockResolvedValue(restricted('teams')),
      audiences: vi
        .fn()
        .mockResolvedValue(new Map([['priya', { teamIds: ['dev'], staff: false }]])),
    });
    const out = await assignCourses(deps, admin, request({ courseIds: ['git', 'sql'] }));
    expect(out.failed).toEqual([{ email: 'priya@nonstopio.com', courseId: 'git' }]);
    expect(store.createAssignments).toHaveBeenCalledWith(
      'k',
      'Kavya Rao',
      expect.not.arrayContaining([
        expect.objectContaining({ id: id('git', 'priya@nonstopio.com') }),
      ]),
    );
    expect(store.audiences).toHaveBeenCalledWith(['priya']);
  });

  it('is assigned to a member of a listed team, to staff, and to someone not signed in yet', async () => {
    for (const [visibility, who] of [
      ['teams', { teamIds: ['qa'], staff: false }],
      ['staff', { teamIds: [], staff: true }],
    ] as const) {
      const { deps } = setup({
        courses: vi.fn().mockResolvedValue(restricted(visibility)),
        audiences: vi.fn().mockResolvedValue(new Map([['priya', who]])),
      });
      expect((await assignCourses(deps, admin, request({ courseIds: ['git'] }))).failed).toEqual(
        [],
      );
    }
    const unknown = setup({
      courses: vi.fn().mockResolvedValue(restricted('staff')),
      signedInUsers: vi.fn().mockResolvedValue(new Map()),
    });
    expect(
      (await assignCourses(unknown.deps, admin, request({ courseIds: ['git'] }))).failed,
    ).toEqual([]);
  });

  it('asks nothing about people when every course is public', async () => {
    const { store, deps } = setup();
    await assignCourses(deps, admin, request());
    expect(store.audiences).not.toHaveBeenCalled();
  });
});

describe('a mail failure', () => {
  it('does not undo the saved assignments', async () => {
    const { mailer, deps } = setup();
    mailer.send.mockRejectedValue(new Error('mail down'));
    const out = await assignCourses(deps, admin, request({ notify: true }));
    expect(out.notified).toBe(0);
    expect(out.assigned).toBeGreaterThan(0);
  });
});

describe('a deadline in the past', () => {
  it('is refused before anything is read or written', async () => {
    const { store, deps } = setup();
    await expect(
      assignCourses(deps, admin, request({ dueAt: Date.now() - 86_400_000 })),
    ).rejects.toMatchObject({ code: 'VAL_1002' });
    expect(store.courses).not.toHaveBeenCalled();
  });
});

describe('assigning to teams', () => {
  const manager = { uid: 'm', email: 'M@nonstopio.com', name: 'Mona', claims: { manager: true } };
  const team = (id: string, members: string[], managers: string[] = ['m@nonstopio.com']) => ({
    id,
    name: id,
    memberEmails: members,
    managerEmails: managers,
  });
  const teams = new Map([
    ['sales', team('sales', ['Priya@nonstopio.com', 'new@nonstopio.com'])],
    ['ops', team('ops', ['new@nonstopio.com', 'ops@nonstopio.com'])],
    ['other', team('other', ['x@nonstopio.com'], ['z@nonstopio.com'])],
  ]);
  const byTeams = (teamIds: string[], over: Record<string, unknown> = {}) =>
    request({ emails: undefined, teamIds, ...over });

  it('lets a manager assign their teams’ people, recording the first team that lists each', async () => {
    const { store, deps } = setup({ teams: vi.fn().mockResolvedValue(teams) });
    const out = await assignCourses(deps, manager, byTeams(['sales', 'ops']));
    expect(out.assigned).toBe(3);
    expect(store.teams).toHaveBeenCalledWith(['sales', 'ops']);
    const docs = (store.createAssignments as ReturnType<typeof vi.fn>).mock.calls[0]?.[2];
    expect(docs.map((d: { email: string; teamId: string }) => [d.email, d.teamId])).toEqual([
      ['priya@nonstopio.com', 'sales'],
      ['new@nonstopio.com', 'sales'],
      ['ops@nonstopio.com', 'ops'],
    ]);
    expect(store.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        by: 'm',
        detail: expect.objectContaining({ teamIds: ['sales', 'ops'], count: 3 }),
      }),
    );
  });

  it('lets an admin assign any team, managed or not', async () => {
    const { store, deps } = setup({ teams: vi.fn().mockResolvedValue(teams) });
    expect((await assignCourses(deps, admin, byTeams(['other']))).assigned).toBe(1);
    const docs = (store.createAssignments as ReturnType<typeof vi.fn>).mock.calls[0]?.[2];
    expect(docs[0]).toMatchObject({ email: 'x@nonstopio.com', teamId: 'other' });
  });

  it('refuses a manager emails, another team, the Educator team and an unknown team', async () => {
    const withTeams = new Map([
      ...teams,
      ['educator-candidates', team('educator-candidates', ['a@nonstopio.com'])],
    ]);
    for (const [data, code] of [
      [request(), 'AUTH_2001'],
      [byTeams(['other']), 'AUTH_2001'],
      [byTeams(['educator-candidates']), 'AUTH_2001'],
      [byTeams(['nope']), 'VAL_1003'],
    ] as const) {
      const { store, deps } = setup({ teams: vi.fn().mockResolvedValue(withTeams) });
      await expect(assignCourses(deps, manager, data)).rejects.toMatchObject({ code });
      expect(store.createAssignments).not.toHaveBeenCalled();
    }
    const asEducator = setup({ teams: vi.fn().mockResolvedValue(teams) });
    await expect(
      assignCourses(
        asEducator.deps,
        { uid: 'e', email: 'm@nonstopio.com', claims: { educator: true } },
        byTeams(['sales']),
      ),
    ).rejects.toMatchObject({ code: 'AUTH_2001' });
  });

  it('refuses a manager a staff-only course or the Educator course', async () => {
    for (const [id, course] of [
      ['git', { ...published('Git'), access: { visibility: 'staff', visibleTeamIds: [] } }],
      [EDUCATOR_COURSE_ID, published('Educators')],
    ] as const) {
      const { store, deps } = setup({
        teams: vi.fn().mockResolvedValue(teams),
        courses: vi.fn().mockResolvedValue({ [id]: course }),
      });
      await expect(
        assignCourses(deps, manager, byTeams(['sales'], { courseIds: [id] })),
      ).rejects.toMatchObject({ code: 'AUTH_2001', details: { courseId: id } });
      expect(store.createAssignments).not.toHaveBeenCalled();
    }
    const { deps } = setup({
      teams: vi.fn().mockResolvedValue(teams),
      courses: vi.fn().mockResolvedValue({
        git: { ...published('Git'), access: { visibility: 'teams', visibleTeamIds: ['sales'] } },
      }),
    });
    expect((await assignCourses(deps, manager, byTeams(['sales']))).assigned).toBe(2);
  });

  it('refuses teams with more than 1000 people in all', async () => {
    const big = (id: string, from: number) =>
      team(
        id,
        Array.from({ length: 500 }, (_, i) => `p${from + i}@nonstopio.com`),
      );
    const { deps } = setup({
      teams: vi.fn().mockResolvedValue(
        new Map([
          ['a', big('a', 0)],
          ['b', big('b', 500)],
          ['c', big('c', 1000)],
        ]),
      ),
    });
    await expect(assignCourses(deps, admin, byTeams(['a', 'b', 'c']))).rejects.toMatchObject({
      code: 'VAL_1004',
      details: { field: 'teamIds' },
    });
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
    ['both emails and teamIds', { teamIds: ['sales'] }, 'VAL_1002', 'teamIds'],
    ['no teams', { emails: undefined, teamIds: [] }, 'VAL_1004', 'teamIds'],
    [
      '21 teams',
      { emails: undefined, teamIds: Array.from({ length: 21 }, (_, i) => `t${i}`) },
      'VAL_1004',
      'teamIds',
    ],
    ['teamIds not a list', { emails: undefined, teamIds: 'sales' }, 'VAL_1002', 'teamIds'],
    ['a team id with a slash', { emails: undefined, teamIds: ['a/b'] }, 'VAL_1002', 'teamIds'],
    ['an empty team id', { emails: undefined, teamIds: [''] }, 'VAL_1002', 'teamIds'],
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
    expect(
      parseAssignRequest(request({ emails: undefined, teamIds: ['sales', 'ops', 'sales'] })),
    ).toMatchObject({ emails: null, teamIds: ['sales', 'ops'] });
    expect(parseAssignRequest(request()).teamIds).toBeNull();
  });
});

describe('emailKey', () => {
  it('is the keyed hex SHA-256 of the text', () => {
    expect(emailKey('abc')).toBe(
      '54c1a670b381ad96071d4394f9eaf45ffe4cca6d5948ac0fa7ef0f507e710f41',
    );
  });
});
