import { describe, expect, it } from 'vitest';
import { courseStatsSchema, orgStatsSchema } from '@gurukul/schema';
import {
  DATE_RANGES,
  MAX_TEAMS,
  failedTwice,
  overdueEntries,
  pendingInvites,
  rangeStart,
  visibleFailed,
  addTeam,
  assignmentsCsv,
  auditLabel,
  averageDays,
  buildLearnerRows,
  allPage,
  drawerCourses,
  filterPeople,
  funnelSteps,
  hardestQuestions,
  isOverdue,
  isFiltered,
  onTab,
  peopleFromAssignments,
  searchPrefix,
  tabCounts,
  parikshaTitle,
  pct,
  parikshaRows,
  WARN_BELOW_PERCENT,
  weeklySeries,
} from '../src/console/model';
import type { AssignmentFull, UserRow } from '../src/console/types';
import { makeCourse, progressRow } from './fake-data';

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

  it('sums a Pariksha first-try results over its questions', () => {
    const q = (id: string) => ({ id }) as never;
    const stats = courseStatsSchema.parse({
      questionFirstTry: {
        a: { correct: 3, total: 4 },
        b: { correct: 0, total: 4 },
        z: { correct: 9, total: 9 },
      },
    });
    expect(
      parikshaRows(
        [
          { id: 'p1', title: 'One', questions: [q('a'), q('b'), q('c')] },
          { id: 'p2', title: 'Two', questions: [q('d')] },
        ],
        stats,
      ),
    ).toEqual([
      { id: 'p1', title: 'One', questions: 3, answers: 8, percent: 38 },
      { id: 'p2', title: 'Two', questions: 1, answers: 0, percent: null },
    ]);
    expect(WARN_BELOW_PERCENT).toBe(70);
  });

  it('computes percentages and average days safely', () => {
    expect(pct(1, 3)).toBe(33);
    expect(pct(1, 0)).toBeNull();
    expect(averageDays({ finishDaysSum: 25, completed: 4 })).toBe(6.3);
    expect(averageDays({ finishDaysSum: 0, completed: 0 })).toBeNull();
  });
});

describe('learner filters', () => {
  const none = { search: '', team: '', role: '', courseId: '' };
  const scope = [
    asg('u1@nonstopio.com', { uid: 'u1', dueAt: new Date('2026-03-01') }),
    asg('u1@nonstopio.com', { uid: 'u1', courseId: 'sql' }),
    asg('b@nonstopio.com'),
    asg('a@nonstopio.com', { dueAt: new Date('2026-03-01') }),
    asg('u2@nonstopio.com'),
  ];
  const emails = (people: Array<{ email: string }>) => people.map((p) => p.email);

  it('starts a search at two characters and knows when anything narrows the table', () => {
    expect(searchPrefix(' R ')).toBe('');
    expect(searchPrefix(' Ro ')).toBe('ro');
    expect(isFiltered(none)).toBe(false);
    expect(isFiltered({ ...none, search: 'r' })).toBe(false);
    expect(isFiltered({ ...none, search: 'ro' })).toBe(true);
    expect(isFiltered({ ...none, team: 'QA' })).toBe(true);
    expect(isFiltered({ ...none, role: 'acharya' })).toBe(true);
    expect(isFiltered({ ...none, courseId: 'git' })).toBe(true);
  });

  it('lists one person per email from assignments, sorted, with the uid any of them carries', () => {
    expect(peopleFromAssignments(scope)).toEqual([
      { email: 'a@nonstopio.com', uid: null, user: null },
      { email: 'b@nonstopio.com', uid: null, user: null },
      { email: 'u1@nonstopio.com', uid: 'u1', user: null },
      { email: 'u2@nonstopio.com', uid: null, user: null },
    ]);
    expect(peopleFromAssignments([asg('c@x.com'), asg('c@x.com', { uid: 'uc' })])[0]?.uid).toBe(
      'uc',
    );
  });

  it('with only a course, takes everyone from that course', () => {
    expect(emails(filterPeople(null, scope, { ...none, courseId: 'git' }))).toHaveLength(4);
  });

  it('combines search, team, role and course over people and pending invites', () => {
    const users = [
      user(1, { roles: ['shishya', 'acharya'] }),
      user(2, { team: 'Dev' }),
      user(3, { team: null }),
    ];
    expect(emails(filterPeople(users, scope, none))).toEqual([
      'a@nonstopio.com',
      'b@nonstopio.com',
      'u1@nonstopio.com',
      'u2@nonstopio.com',
      'u3@nonstopio.com',
    ]);
    expect(filterPeople(users, scope, { ...none, search: 'U' })).toHaveLength(5);
    expect(emails(filterPeople(users, scope, { ...none, search: 'u1' }))).toEqual([
      'u1@nonstopio.com',
    ]);
    expect(emails(filterPeople(users, scope, { ...none, team: 'QA' }))).toEqual([
      'u1@nonstopio.com',
    ]);
    expect(emails(filterPeople(users, scope, { ...none, role: 'acharya' }))).toEqual([
      'u1@nonstopio.com',
    ]);
    expect(emails(filterPeople(users, scope, { ...none, courseId: 'git', search: 'u2' }))).toEqual([
      'u2@nonstopio.com',
    ]);
    expect(emails(filterPeople(users, [], { ...none, courseId: 'git' }))).toEqual([]);
  });

  it('matches a search against the start of a signed-in name, with a team or role chosen', () => {
    const users = [
      user(1, { displayName: 'Ananya Rao', team: 'QA' }),
      user(2, { displayName: 'Ravi K', team: 'QA' }),
    ];
    const qa = { ...none, team: 'QA' };
    expect(emails(filterPeople(users, scope, { ...qa, search: 'Anan' }))).toEqual([
      'u1@nonstopio.com',
    ]);
    expect(emails(filterPeople(users, scope, { ...qa, search: 'rao' }))).toEqual([]);
    expect(emails(filterPeople(users, [], { ...qa, search: 'ravi', courseId: 'git' }))).toEqual([]);
  });

  it('trusts people the search itself found, still narrowing them by course', () => {
    const found = [user(1, { email: 'priya@nonstopio.com' }), user(2)];
    const f = { ...none, search: 'priya s', courseId: 'git' };
    expect(emails(filterPeople(found, [asg('u2@nonstopio.com')], f, true))).toEqual([
      'u2@nonstopio.com',
    ]);
  });

  it('splits people into tabs and counts each', () => {
    const people = peopleFromAssignments(scope);
    expect(emails(onTab(people, 'signedIn', scope, now))).toEqual(['u1@nonstopio.com']);
    expect(emails(onTab(people, 'pending', scope, now))).toHaveLength(3);
    expect(emails(onTab(people, 'overdue', scope, now))).toEqual([
      'a@nonstopio.com',
      'u1@nonstopio.com',
    ]);
    expect(onTab(people, 'all', scope, now)).toHaveLength(4);
    expect(tabCounts(people, scope, now)).toEqual({
      all: 4,
      signedIn: 1,
      pending: 3,
      overdue: 2,
    });
  });

  it('pages "All" as signed-in people first, then pending invites', () => {
    expect(allPage(1, 25, 30)).toEqual({ people: true, pending: [0, 0] });
    expect(allPage(2, 25, 30)).toEqual({ people: true, pending: [0, 20] });
    expect(allPage(3, 25, 30)).toEqual({ people: false, pending: [20, 45] });
    expect(allPage(1, 25, 0)).toEqual({ people: false, pending: [0, 25] });
  });
});

describe('auditLabel', () => {
  it('words known actions and shows unknown ones as written', () => {
    expect(auditLabel('roles.set')).toBe('Changed a role');
    expect(auditLabel('something.new')).toBe('something.new');
  });
});

describe('assignmentsCsv', () => {
  const a = (over: Partial<AssignmentFull>): AssignmentFull => ({
    id: 'x',
    email: 'a@nonstopio.com',
    uid: 'u1',
    courseId: 'git',
    dueAt: new Date('2026-04-02T10:00:00Z'),
    assignedAt: new Date('2026-03-01T00:00:00Z'),
    mandatory: true,
    status: 'started',
    ...over,
  });

  it('writes a header and one row per assignment with course titles', () => {
    const csv = assignmentsCsv([a({})], new Map([['git', 'Git, the NonStop Way']]));
    expect(csv).toBe(
      'Email,Course,Status,Mandatory,Assigned,Due,Signed in\n' +
        'a@nonstopio.com,"Git, the NonStop Way",started,yes,2026-03-01,2026-04-02,yes\n',
    );
  });

  it('falls back to the course id, leaves missing dates empty and marks pending invites', () => {
    const csv = assignmentsCsv(
      [a({ uid: null, dueAt: null, assignedAt: null, mandatory: false, courseId: 'sql' })],
      new Map(),
    );
    expect(csv.split('\n')[1]).toBe('a@nonstopio.com,sql,started,no,,,no');
  });

  it('defuses spreadsheet formulas and escapes quotes', () => {
    const csv = assignmentsCsv(
      [a({ email: '=cmd@nonstopio.com' })],
      new Map([['git', 'The "best" course']]),
    );
    expect(csv.split('\n')[1]).toContain('\'=cmd@nonstopio.com,"The ""best"" course"');
  });
});

describe('drawerCourses', () => {
  const a = (courseId: string, over: Partial<AssignmentFull> = {}): AssignmentFull => ({
    id: courseId,
    email: 'p@nonstopio.com',
    uid: 'u1',
    courseId,
    dueAt: null,
    assignedAt: null,
    mandatory: false,
    status: 'assigned',
    ...over,
  });

  it('lists assignments soonest due first, then by title, then courses opened without one', () => {
    const list = drawerCourses(
      [
        a('b'),
        a('a'),
        a('late', { dueAt: new Date('2026-03-01T00:00:00Z') }),
        a('soon', { dueAt: new Date('2026-03-20T00:00:00Z'), mandatory: true }),
      ],
      [
        progressRow({ courseId: 'extra', percent: 100, completedAt: now }),
        progressRow({ courseId: 'a', percent: 30 }),
      ],
      [makeCourse({ id: 'a', title: 'Alpha' })],
      now,
    );
    expect(list.map((c) => c.courseId)).toEqual(['late', 'soon', 'a', 'b', 'extra']);
    expect(list[0]).toMatchObject({ overdue: true, percent: null, completed: false });
    expect(list[1]).toMatchObject({ overdue: false, mandatory: true });
    expect(list[2]).toMatchObject({ title: 'Alpha', percent: 30 });
    expect(list[4]).toMatchObject({ assigned: false, completed: true, dueAt: null });
  });

  it('names attempted Parikshas by title, by id once they are gone', () => {
    const course = makeCourse();
    expect(parikshaTitle(course, 'q1')).toBe('Pariksha I');
    expect(parikshaTitle(course, 'l1')).toBeNull();
    expect(parikshaTitle(undefined, 'q1')).toBeNull();
    const [git] = drawerCourses(
      [],
      [
        progressRow({
          pariksha: {
            q1: { best: 0.8, passed: true, attempts: 1, lastAttemptAt: null },
            old: { best: 0, passed: false, attempts: 2, lastAttemptAt: null },
            none: { best: 0, passed: false, attempts: 0, lastAttemptAt: null },
          },
        }),
      ],
      [course],
      now,
    );
    expect(git?.parikshas).toEqual([
      { id: 'q1', title: 'Pariksha I', attempts: 1, best: 0.8, passed: true },
      { id: 'old', title: 'old', attempts: 2, best: 0, passed: false },
    ]);
  });
});

describe('addTeam', () => {
  it('appends a trimmed name', () => {
    expect(addTeam(['QA'], '  Mobile ')).toEqual({ teams: ['QA', 'Mobile'] });
  });
  it('refuses a blank, too long or duplicate name, and a full list', () => {
    expect(addTeam([], '   ')).toEqual({ error: 'Enter a team name.' });
    expect(addTeam([], 'x'.repeat(81))).toEqual({ error: 'Use 80 characters or fewer.' });
    expect(addTeam([], 'x'.repeat(80))).toEqual({ teams: ['x'.repeat(80)] });
    expect(addTeam(['QA'], 'qa')).toEqual({ error: 'qa is already in the list.' });
    const full = Array.from({ length: MAX_TEAMS }, (_, i) => `T${i}`);
    expect(addTeam(full, 'One more')).toEqual({ error: 'The list holds at most 100 teams.' });
  });
});

describe('Needs attention model', () => {
  it('turns a range into its earliest moment', () => {
    expect(DATE_RANGES.map((r) => r.id)).toEqual(['all', '30d', 'quarter']);
    expect(rangeStart('all', now)).toBeNull();
    expect(rangeStart('30d', now)?.toISOString()).toBe('2026-02-08T00:00:00.000Z');
    expect(rangeStart('quarter', now)?.toISOString()).toBe('2025-12-10T00:00:00.000Z');
  });

  it('lists the five longest overdue, in range and in team', () => {
    const late = (n: number, day: number, over: Partial<AssignmentFull> = {}) =>
      asg(`o${n}@nonstopio.com`, {
        uid: 'u',
        status: 'started',
        dueAt: new Date(Date.UTC(2026, 1, day)),
        ...over,
      });
    const open = [
      ...[5, 4, 3, 2, 1, 6].map((d) => late(d, d)),
      late(7, 1, { status: 'completed' }),
      late(8, 1, { dueAt: new Date('2025-01-01T00:00:00Z') }),
    ];
    expect(overdueEntries(open, now, null, null).map((e) => e.email)).toEqual([
      'o8@nonstopio.com',
      'o1@nonstopio.com',
      'o2@nonstopio.com',
      'o3@nonstopio.com',
      'o4@nonstopio.com',
    ]);
    const inRange = overdueEntries(open, now, new Date('2026-02-01T00:00:00Z'), null);
    expect(inRange.map((e) => e.email)).not.toContain('o8@nonstopio.com');
    expect(
      overdueEntries(open, now, null, new Set(['o2@nonstopio.com'])).map((e) => e.email),
    ).toEqual(['o2@nonstopio.com']);
  });

  it('finds Parikshas failed at least twice and not passed since', () => {
    const at = (d: number) => new Date(Date.UTC(2026, 2, d));
    const row = (uid: string, over: Parameters<typeof progressRow>[0]) => ({
      ...progressRow(over),
      uid,
    });
    const found = failedTwice([
      row('a', {
        pariksha: { q1: { best: 0.2, passed: false, attempts: 2, lastAttemptAt: at(1) } },
      }),
      row('b', {
        pariksha: {
          q1: { best: 0.2, passed: false, attempts: 4, lastAttemptAt: at(5) },
          q2: { best: 0.9, passed: true, attempts: 3, lastAttemptAt: at(6) },
          q3: { best: 0.1, passed: false, attempts: 1, lastAttemptAt: at(7) },
        },
      }),
      row('c', {
        pariksha: { q1: { best: 0.2, passed: false, attempts: 2, lastAttemptAt: null } },
      }),
      row('e', {
        pariksha: { q1: { best: 0.2, passed: false, attempts: 2, lastAttemptAt: null } },
      }),
    ]);
    expect(found.map((f) => f.key)).toEqual(['b/git/q1', 'a/git/q1', 'c/git/q1', 'e/git/q1']);
    expect(visibleFailed(found, at(3), null).map((f) => f.uid)).toEqual(['b']);
    expect(visibleFailed(found, null, new Set(['a'])).map((f) => f.uid)).toEqual(['a']);
  });

  it('lists each pending email once, newest invite first, with the full count', () => {
    const open = [
      asg('a@nonstopio.com', { assignedAt: new Date('2026-03-01T00:00:00Z') }),
      asg('a@nonstopio.com', { courseId: 'sql', assignedAt: new Date('2026-03-05T00:00:00Z') }),
      asg('a@nonstopio.com', { courseId: 'go', assignedAt: new Date('2026-03-02T00:00:00Z') }),
      asg('b@nonstopio.com', { assignedAt: new Date('2026-03-03T00:00:00Z') }),
      asg('c@nonstopio.com', { assignedAt: null }),
      asg('c@nonstopio.com', { courseId: 'sql', assignedAt: null }),
      asg('d@nonstopio.com', { uid: 'u1' }),
    ];
    const all = pendingInvites(open, null);
    expect(all.shown.map((p) => p.email)).toEqual([
      'a@nonstopio.com',
      'b@nonstopio.com',
      'c@nonstopio.com',
    ]);
    expect(all.total).toBe(3);
    expect(pendingInvites(open, new Date('2026-03-04T00:00:00Z')).total).toBe(1);
  });
});
