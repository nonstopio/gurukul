import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  arrayUnion,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { nonstop, startEnv } from './helpers';

let env: RulesTestEnvironment;
const as = (uid: string, claims: Record<string, unknown> = {}) => nonstop(env, uid, claims);

const newProgress = (uid: string, courseId = 'git', over: Record<string, unknown> = {}) => ({
  uid,
  courseId,
  courseVersion: 1,
  startedAt: serverTimestamp(),
  lastItemId: null,
  lastActiveAt: serverTimestamp(),
  completedItemIds: [],
  pariksha: {},
  percent: 0,
  completedAt: null,
  certificateId: null,
  ...over,
});

beforeAll(async () => {
  env = await startEnv();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'courses/git'), {
      status: 'published',
      acharyaIds: ['asha'],
      title: 'Git',
    });
    await setDoc(doc(db, 'courses/wip'), { status: 'draft', acharyaIds: ['asha'], title: 'WIP' });
    await setDoc(doc(db, 'courses/old'), { status: 'archived', acharyaIds: [], title: 'Old' });
    await setDoc(doc(db, 'courses/git/private/answers'), { q: { a: ['a'] } });
    await setDoc(doc(db, 'progress/priya_git'), {
      uid: 'priya',
      courseId: 'git',
      courseVersion: 1,
      completedItemIds: ['l1'],
      lastItemId: 'l1',
      pariksha: {},
      percent: 10,
    });
  });
});
afterAll(async () => {
  await env.cleanup();
});

describe('courses/{id}', () => {
  it('lets any signed-in NonStop account read published and archived courses', async () => {
    await assertSucceeds(getDoc(doc(as('priya'), 'courses/git')));
    await assertSucceeds(getDoc(doc(as('priya'), 'courses/old')));
  });
  it('hides a draft course from learners but not from its Acharya or a Kulapati', async () => {
    await assertFails(getDoc(doc(as('priya'), 'courses/wip')));
    await assertFails(getDoc(doc(as('rohan', { acharya: true }), 'courses/wip')));
    await assertSucceeds(getDoc(doc(as('asha', { acharya: true }), 'courses/wip')));
    await assertSucceeds(getDoc(doc(as('ajay', { kulapati: true }), 'courses/wip')));
  });
  it('denies signed-out and non-NonStop reads', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'courses/git')));
    await assertFails(getDoc(doc(as('priya', { email: 'p@gmail.com' }), 'courses/git')));
  });
  it('denies every client write, even a Kulapati', async () => {
    await assertFails(
      updateDoc(doc(as('ajay', { kulapati: true }), 'courses/git'), { title: 'X' }),
    );
    await assertFails(setDoc(doc(as('asha', { acharya: true }), 'courses/new'), { title: 'X' }));
  });
  it('never exposes the answer keys, to anyone', async () => {
    await assertFails(getDoc(doc(as('ajay', { kulapati: true }), 'courses/git/private/answers')));
    await assertFails(getDoc(doc(as('asha', { acharya: true }), 'courses/git/private/answers')));
    await assertFails(
      setDoc(doc(as('ajay', { kulapati: true }), 'courses/git/private/answers'), {}),
    );
  });
});

describe('progress/{uid_courseId} read', () => {
  it('lets the owner, a Kulapati and the course Acharya read it', async () => {
    await assertSucceeds(getDoc(doc(as('priya'), 'progress/priya_git')));
    await assertSucceeds(getDoc(doc(as('ajay', { kulapati: true }), 'progress/priya_git')));
    await assertSucceeds(getDoc(doc(as('asha', { acharya: true }), 'progress/priya_git')));
  });
  it("denies another learner, another course's Acharya and signed-out readers", async () => {
    await assertSucceeds(getDoc(doc(as('rohan'), 'progress/rohan_git')));
    await assertFails(getDoc(doc(as('rohan'), 'progress/priya_git')));
    await assertFails(getDoc(doc(as('rohan'), 'progress/priya_unborn')));
    await assertFails(getDoc(doc(as('rohan', { acharya: true }), 'progress/priya_git')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'progress/priya_git')));
  });
});

describe('progress create', () => {
  it('lets a learner start a published course', async () => {
    await assertSucceeds(setDoc(doc(as('rohan'), 'progress/rohan_git'), newProgress('rohan')));
  });
  it('denies starting for someone else, with a mismatched id, or a non-published course', async () => {
    await assertFails(setDoc(doc(as('rohan'), 'progress/priya_git2'), newProgress('priya')));
    await assertFails(setDoc(doc(as('rohan'), 'progress/rohan_other'), newProgress('rohan')));
    await assertFails(setDoc(doc(as('rohan'), 'progress/rohan_wip'), newProgress('rohan', 'wip')));
  });
  it('denies a head start: scores, percent, completed items or a certificate', async () => {
    const db = as('rohan');
    await assertFails(
      setDoc(doc(db, 'progress/rohan_git'), newProgress('rohan', 'git', { percent: 100 })),
    );
    await assertFails(
      setDoc(
        doc(db, 'progress/rohan_git'),
        newProgress('rohan', 'git', { completedItemIds: ['l1'] }),
      ),
    );
    await assertFails(
      setDoc(
        doc(db, 'progress/rohan_git'),
        newProgress('rohan', 'git', { certificateId: 'NSG-GIT-26-0001' }),
      ),
    );
    await assertFails(
      setDoc(
        doc(db, 'progress/rohan_git'),
        newProgress('rohan', 'git', { pariksha: { q1: { passed: true } } }),
      ),
    );
    await assertFails(
      setDoc(doc(db, 'progress/rohan_git'), newProgress('rohan', 'git', { extra: 1 })),
    );
  });
});

describe('progress update', () => {
  it('lets the owner append completed items and move the resume point', async () => {
    await assertSucceeds(
      updateDoc(doc(as('priya'), 'progress/priya_git'), {
        completedItemIds: ['l1', 'l2'],
        lastItemId: 'l2',
        lastActiveAt: serverTimestamp(),
      }),
    );
  });
  it('denies removing a completed item, or an over-long list', async () => {
    const db = as('priya');
    await assertFails(
      updateDoc(doc(db, 'progress/priya_git'), {
        completedItemIds: [],
        lastActiveAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(db, 'progress/priya_git'), {
        completedItemIds: Array.from({ length: 201 }, (_, i) => `x${i}`).concat('l1'),
        lastActiveAt: serverTimestamp(),
      }),
    );
  });
  it('lets the owner append with arrayUnion, including an id already there', async () => {
    const db = as('priya');
    await assertSucceeds(
      updateDoc(doc(db, 'progress/priya_git'), {
        completedItemIds: arrayUnion('l2'),
        lastActiveAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      updateDoc(doc(db, 'progress/priya_git'), {
        completedItemIds: arrayUnion('l1'),
        lastActiveAt: serverTimestamp(),
      }),
    );
  });
  it('denies appending more than one id, a non-string, an empty or over-long id, or a duplicate', async () => {
    const db = as('priya');
    const append = (completedItemIds: unknown[]) =>
      updateDoc(doc(db, 'progress/priya_git'), {
        completedItemIds,
        lastActiveAt: serverTimestamp(),
      });
    await assertFails(append(['l1', 'l2', 'l3']));
    await assertFails(append(['l1', 7]));
    await assertFails(append(['l1', { id: 'l2' }]));
    await assertFails(append(['l1', '']));
    await assertFails(append(['l1', 'x'.repeat(81)]));
    await assertFails(append(['l1', 'l1']));
    await assertFails(append(['l2', 'l1']));
  });
  it('denies setting percent, Pariksha results or a certificate', async () => {
    const db = as('priya');
    await assertFails(
      updateDoc(doc(db, 'progress/priya_git'), { percent: 100, lastActiveAt: serverTimestamp() }),
    );
    await assertFails(
      updateDoc(doc(db, 'progress/priya_git'), {
        pariksha: { q: { passed: true } },
        lastActiveAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(db, 'progress/priya_git'), {
        certificateId: 'x',
        lastActiveAt: serverTimestamp(),
      }),
    );
  });
  it("denies someone else's update, a forged timestamp and a delete", async () => {
    await assertFails(
      updateDoc(doc(as('rohan'), 'progress/priya_git'), {
        lastItemId: 'l9',
        lastActiveAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(as('ajay', { kulapati: true }), 'progress/priya_git'), {
        lastItemId: 'l9',
        lastActiveAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(as('priya'), 'progress/priya_git'), {
        lastItemId: 'l2',
        lastActiveAt: new Date(0),
      }),
    );
    await assertFails(deleteDoc(doc(as('priya'), 'progress/priya_git')));
  });
});
