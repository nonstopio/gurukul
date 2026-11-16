import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { course } from '../test/fixtures.js';

// The real trigger exports from src/index.ts, run against the Firestore emulator through the
// `.run(event)` hook firebase-functions gives every v2 function. Nothing in src/ is mocked.
process.env.GCLOUD_PROJECT = 'demo-gurukul';
const index = await import('../src/index.js');

const db = () => getFirestore();
const ID = 'u1_git-basics';
const snap = (data: object | undefined) => ({ data: () => data });
const at = (ms: number) => Timestamp.fromMillis(ms);

const liveCourse = () => ({ ...course(), publishedAt: at(1) });
const progress = (over: object = {}) => ({
  uid: 'u1',
  courseId: 'git-basics',
  courseVersion: 3,
  startedAt: at(1),
  lastItemId: null,
  lastActiveAt: at(1),
  completedItemIds: [],
  quiz: {},
  percent: 0,
  completedAt: null,
  certificateId: null,
  ...over,
});
const passed = { best: 1, passed: true, attempts: 1, lastAttemptAt: at(2) };

async function clear(): Promise<void> {
  for (const c of [
    'progress',
    'courses',
    'assignments',
    'stats',
    'certificates',
    'counters',
    'users',
    'audit',
    'teams',
  ])
    await db().recursiveDelete(db().collection(c));
}

const progressWritten = (before: object | undefined, after: object | undefined) =>
  index.onProgressWritten.run({
    params: { progressId: ID },
    data: { before: snap(before), after: snap(after) },
  } as never);

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run through `npm run test:emulator`');
});
beforeEach(clear);

describe('onProgressWritten', () => {
  it('derives the percent, completes the assignment, issues one certificate and counts it', async () => {
    await db().doc('courses/git-basics').set(liveCourse());
    await db().doc('users/u1').set({ displayName: 'Asha Rao', email: 'asha@example.com' });
    await db().doc('assignments/a1').set({ uid: 'u1', courseId: 'git-basics', status: 'assigned' });
    const after = progress({ quiz: { pk: passed } });
    await db().doc(`progress/${ID}`).set(after);

    await progressWritten(undefined, after);
    // The trigger's own write fires it again, now seeing `completedAt`: that pass completes the assignment.
    const derived = (await db().doc(`progress/${ID}`).get()).data() ?? {};
    await progressWritten(after, derived);

    const stored = (await db().doc(`progress/${ID}`).get()).data() ?? {};
    expect(stored.percent).toBe(100);
    expect(stored.completedAt).toBeInstanceOf(Timestamp);
    expect(stored.certificateId).toMatch(/^NSG-GIT-\d{2}-0001$/);
    const cert = (await db().doc(`certificates/${stored.certificateId}`).get()).data() ?? {};
    expect(cert).toMatchObject({ uid: 'u1', learnerName: 'Asha Rao', revoked: false });
    expect((await db().doc('assignments/a1').get()).get('status')).toBe('completed');
    expect((await db().doc('stats/course_git-basics').get()).data()).toMatchObject({
      started: 1,
      completed: 1,
    });
    expect((await db().doc('stats/org').get()).get('assignmentsCompleted')).toBe(1);
  });

  it('is idempotent: its own write re-triggers it and nothing is issued or counted twice', async () => {
    await db().doc('courses/git-basics').set(liveCourse());
    const first = progress({ quiz: { pk: passed } });
    await db().doc(`progress/${ID}`).set(first);
    await progressWritten(undefined, first);

    const settled = (await db().doc(`progress/${ID}`).get()).data() ?? {};
    await progressWritten(first, settled);

    expect((await db().collection('certificates').get()).size).toBe(1);
    expect((await db().doc('stats/course_git-basics').get()).get('completed')).toBe(1);
  });

  it('ignores a write whose course does not exist', async () => {
    const after = progress();
    await db().doc(`progress/${ID}`).set(after);

    await progressWritten(undefined, after);

    expect((await db().doc(`progress/${ID}`).get()).get('percent')).toBe(0);
  });

  it('ignores a deleted document', async () => {
    await expect(progressWritten(progress(), undefined)).resolves.toBeUndefined();
  });
});

describe('onProgressWritten, the Educator course', () => {
  const EDU = 'educator-onboarding';
  const finish = async (uid: string) => {
    const id = `${uid}_${EDU}`;
    const after = progress({ uid, courseId: EDU, quiz: { pk: passed } });
    await db().doc(`progress/${id}`).set(after);
    await index.onProgressWritten.run({
      params: { progressId: id },
      data: { before: snap(undefined), after: snap(after) },
    } as never);
    return (await db().doc(`progress/${id}`).get()).data() ?? {};
  };
  const newUser = async (uid: string) => {
    await getAuth()
      .deleteUser(uid)
      .catch(() => undefined);
    await getAuth().createUser({ uid, email: `${uid}@example.com`, emailVerified: true });
    await db()
      .doc(`users/${uid}`)
      .set({ displayName: uid, roles: ['learner'] });
  };

  beforeEach(async () => {
    await db()
      .doc(`courses/${EDU}`)
      .set({ ...liveCourse(), id: EDU });
  });

  it('makes a learner an Admin assigned it to an Educator, and issues the certificate', async () => {
    await newUser('assigned');
    await db().doc('assignments/a1').set({ uid: 'assigned', courseId: EDU, status: 'assigned' });

    const stored = await finish('assigned');

    expect(stored.certificateId).toMatch(/^NSG-EDUCATOR-\d{2}-0001$/);
    expect((await getAuth().getUser('assigned')).customClaims).toEqual({
      educator: true,
      manager: false,
      admin: false,
    });
    expect((await db().doc('users/assigned').get()).get('roles')).toEqual(['learner', 'educator']);
    const audit = await db().collection('audit').where('target', '==', 'assigned').get();
    expect(audit.docs.map((d) => d.get('action'))).toEqual(['roles.course']);
  });

  it('gives someone nobody assigned it the certificate but not the role', async () => {
    await newUser('unassigned');

    const stored = await finish('unassigned');

    expect(stored.certificateId).toMatch(/^NSG-EDUCATOR-/);
    expect((await getAuth().getUser('unassigned')).customClaims ?? {}).not.toHaveProperty(
      'educator',
    );
    expect((await db().doc('users/unassigned').get()).get('roles')).toEqual(['learner']);
  });
});

const teamWritten = (before: object | undefined, after: object | undefined) =>
  index.onTeamWritten.run({
    params: { teamId: 'qa' },
    data: { before: snap(before), after: snap(after) },
  } as never);

describe('onTeamWritten', () => {
  it('puts a joining member on the team, takes a leaving one off, and leaves a rename alone', async () => {
    await db()
      .doc('users/u1')
      .set({ email: 'a@example.com', teamIds: ['qa'] });
    await db().doc('users/u2').set({ email: 'b@example.com', teamIds: [] });
    const before = { name: 'QA', memberEmails: ['a@example.com'] };
    const after = { name: 'QA', memberEmails: ['b@example.com'] };
    await db().doc('teams/qa').set(after);

    await teamWritten(before, after);

    expect((await db().doc('users/u1').get()).get('teamIds')).toEqual([]);
    expect((await db().doc('users/u2').get()).get('teamIds')).toEqual(['qa']);

    // A rename reads and writes no profile: a value planted on one is still there afterwards.
    await db()
      .doc('users/u2')
      .update({ teamIds: ['planted'] });
    const renamed = { ...after, name: 'Quality' };
    await db().doc('teams/qa').set(renamed);
    await teamWritten(after, renamed);
    expect((await db().doc('users/u2').get()).get('teamIds')).toEqual(['planted']);
  });
});

describe('onAttemptCreated', () => {
  const attempt = (over: object = {}) => ({
    uid: 'u1',
    courseId: 'git-basics',
    quizId: 'pk',
    score: 0.5,
    passed: false,
    results: [{ questionId: 'q1', correct: true }],
    ...over,
  });
  const attemptCreated = (data: object) =>
    index.onAttemptCreated.run({
      params: { progressId: ID, attemptId: 'a1' },
      data: snap(data),
    } as never);

  it('adds the score and the first-try counters to the course and org stats', async () => {
    await db()
      .doc(`progress/${ID}`)
      .set(progress({ quiz: { pk: { ...passed, passed: false, attempts: 1 } } }));

    await attemptCreated(attempt());
    await attemptCreated(attempt({ score: 1, passed: true }));

    expect((await db().doc('stats/course_git-basics').get()).data()).toMatchObject({
      scoreSum: 1.5,
      scoreCount: 2,
      questionFirstTry: { q1: { correct: 2, total: 2 } },
    });
    expect((await db().doc('stats/org').get()).data()).toMatchObject({
      quizScoreCount: 2,
      quizFirstTryTotal: 2,
      quizFirstTryPassed: 1,
    });
  });

  it('ignores a malformed attempt', async () => {
    await attemptCreated({ uid: 'u1' });
    expect((await db().doc('stats/org').get()).exists).toBe(false);
  });
});

describe('dailyRollup', () => {
  const stats = async (scope: string) => (await db().doc(`stats/${scope}`).get()).data();
  const run = () => index.dailyRollup.run({} as never);

  it('recounts everything once, then only a course with activity, keeping the attempt counters', async () => {
    await db().doc('courses/git-basics').set(liveCourse());
    await db().doc(`progress/${ID}`).set(progress());
    await db()
      .doc('progress/u2_git-basics')
      .set(progress({ uid: 'u2' }));
    await db().doc('users/u1').set({ displayName: 'Asha Rao' });
    await db().doc('stats/course_git-basics').set({ started: 5, completed: 0, scoreSum: 3 });
    await db().doc('stats/org').set({ started: 9, completed: 1, quizScoreCount: 4 });

    await run();

    expect(await stats('course_git-basics')).toMatchObject({
      assigned: 0,
      started: 2,
      completed: 0,
      scoreSum: 3,
    });
    expect(await stats('org')).toMatchObject({
      usersTotal: 1,
      started: 6,
      completed: 1,
      quizScoreCount: 4,
    });
    const roster = await db().collection('courses/git-basics/learners').get();
    expect(Object.fromEntries(roster.docs.map((d) => [d.id, d.get('displayName')]))).toEqual({
      u1: 'Asha Rao',
      u2: '',
    });
    expect((await db().doc('counters/rollup').get()).get('retry')).toEqual([]);

    // Nothing happened since: drift in a quiet course is left for the night it next has activity.
    await db().doc('stats/course_git-basics').update({ started: 7 });
    await run();
    expect(await stats('course_git-basics')).toMatchObject({ started: 7 });

    await db().doc(`progress/${ID}`).update({ lastActiveAt: Timestamp.now() });
    await db().doc('users/u1').update({ displayName: 'Asha R' });
    await run();
    expect(await stats('course_git-basics')).toMatchObject({ started: 2, scoreSum: 3 });
    expect(await stats('org')).toMatchObject({ started: 1 });
    expect((await db().doc('courses/git-basics/learners/u1').get()).get('displayName')).toBe(
      'Asha R',
    );
  });
});

describe('firestoreReminderStore', () => {
  it('reads every open assignment, past the old 1,000 per course limit, and no completed one', async () => {
    const { firestoreReminderStore } = await import('../src/stores.js');
    const writer = db().bulkWriter();
    for (let i = 0; i < 1001; i++) {
      writer.set(db().doc(`assignments/a${i}`), {
        email: `u${i}@example.com`,
        courseId: 'git-basics',
        status: i % 2 === 0 ? 'assigned' : 'started',
        mandatory: true,
        reminder: 'weekly',
        assignedAt: at(1),
      });
    }
    writer.set(db().doc('assignments/done'), {
      email: 'd@example.com',
      courseId: 'git-basics',
      status: 'completed',
      assignedAt: at(1),
    });
    writer.set(db().doc('assignments/other'), {
      email: 'o@example.com',
      courseId: 'other',
      status: 'assigned',
      assignedAt: at(1),
    });
    await writer.close();

    const store = firestoreReminderStore(db());
    expect(await store.forCourse('git-basics')).toHaveLength(1001);
    expect(await store.scheduled()).toHaveLength(1002);
  });
});
