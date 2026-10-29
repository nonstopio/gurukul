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
