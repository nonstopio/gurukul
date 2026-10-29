import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { nonstop, startEnv } from './helpers';

let env: RulesTestEnvironment;
const as = (uid: string, claims: Record<string, unknown> = {}) => nonstop(env, uid, claims);
const asha = () => as('asha', { educator: true });
const rohan = () => as('rohan', { educator: true });
const ajay = () => as('ajay', { admin: true });
const priya = () => as('priya');

const draftSave = (over: Record<string, unknown> = {}, courseOver: object = {}) => ({
  rev: 5,
  updatedAt: serverTimestamp(),
  updatedBy: 'asha',
  course: { id: 'wip', title: 'WIP', chapters: [], ...courseOver },
  answers: {},
  ...over,
});
const bankEntry = (uid: string, over: Record<string, unknown> = {}) => ({
  question: { id: 'q1', prompt: 'P' },
  answers: ['a'],
  tags: ['git'],
  createdBy: uid,
  createdAt: serverTimestamp(),
  ...over,
});

beforeAll(async () => {
  env = await startEnv();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'courses/wip'), { status: 'draft', educatorIds: ['asha'], title: 'WIP' });
    await setDoc(doc(db, 'courses/other'), { status: 'draft', educatorIds: ['rohan'], title: 'O' });
    await setDoc(doc(db, 'courses/live'), {
      status: 'published',
      educatorIds: ['rohan'],
      title: 'L',
    });
    await setDoc(doc(db, 'courses/wip/drafts/current'), {
      rev: 4,
      updatedBy: 'asha',
      course: { id: 'wip' },
      answers: {},
    });
    await setDoc(doc(db, 'courses/wip/versions/1'), { version: 1, course: { id: 'wip' } });
    await setDoc(doc(db, 'courses/wip/learners/priya'), { displayName: 'Priya Rao' });
    await setDoc(doc(db, 'questionBank/b1'), bankEntry('asha', { createdAt: new Date() }));
  });
});
afterAll(async () => {
  await env.cleanup();
});

describe('courses list queries', () => {
  it('lets an Educator list the courses that name them', async () => {
    const q = query(collection(asha(), 'courses'), where('educatorIds', 'array-contains', 'asha'));
    const snap = await assertSucceeds(getDocs(q));
    if (snap.docs.map((d) => d.id).join() !== 'wip') throw new Error('expected only wip');
  });
  it('lets an Admin and any Educator list every course, never-published ones included', async () => {
    const all = await assertSucceeds(getDocs(collection(ajay(), 'courses')));
    if (all.size !== 3) throw new Error('expected all courses');
    const seen = await assertSucceeds(getDocs(collection(asha(), 'courses')));
    if (seen.docs.map((d) => d.id).join() !== 'live,other,wip') throw new Error('expected all');
  });
  it('denies a learner an unfiltered listing or any listing that would include a draft course', async () => {
    await assertFails(getDocs(collection(priya(), 'courses')));
    await assertFails(
      getDocs(
        query(collection(priya(), 'courses'), where('educatorIds', 'array-contains', 'asha')),
      ),
    );
  });
});

describe('courses/{id}/drafts/current', () => {
  it('is read by the course Educator and an Admin only', async () => {
    await assertSucceeds(getDoc(doc(asha(), 'courses/wip/drafts/current')));
    await assertSucceeds(getDoc(doc(ajay(), 'courses/wip/drafts/current')));
    await assertFails(getDoc(doc(rohan(), 'courses/wip/drafts/current')));
    await assertFails(getDoc(doc(priya(), 'courses/wip/drafts/current')));
    await assertFails(
      getDoc(doc(env.unauthenticatedContext().firestore(), 'courses/wip/drafts/current')),
    );
  });

  it('accepts a save by the Educator or an Admin that moves rev up by one', async () => {
    await assertSucceeds(updateDoc(doc(asha(), 'courses/wip/drafts/current'), draftSave()));
    await assertSucceeds(
      updateDoc(
        doc(ajay(), 'courses/wip/drafts/current'),
        draftSave({ rev: 6, updatedBy: 'ajay' }),
      ),
    );
  });

  it('denies a save by another Educator or a learner', async () => {
    await assertFails(
      updateDoc(doc(rohan(), 'courses/wip/drafts/current'), draftSave({ updatedBy: 'rohan' })),
    );
    await assertFails(
      updateDoc(doc(priya(), 'courses/wip/drafts/current'), draftSave({ updatedBy: 'priya' })),
    );
  });

  it('denies a stale or skipped rev, a forged author or time, and extra keys', async () => {
    const ref = doc(asha(), 'courses/wip/drafts/current');
    await assertFails(updateDoc(ref, draftSave({ rev: 4 })));
    await assertFails(updateDoc(ref, draftSave({ rev: 6 })));
    await assertFails(updateDoc(ref, draftSave({ updatedBy: 'rohan' })));
    await assertFails(updateDoc(ref, draftSave({ updatedAt: new Date() })));
    await assertFails(updateDoc(ref, draftSave({ extra: 1 })));
  });

  it('denies a course that is not a map for this id, has too many chapters, or bad answers', async () => {
    const ref = doc(asha(), 'courses/wip/drafts/current');
    await assertFails(updateDoc(ref, draftSave({ course: 'x' })));
    await assertFails(updateDoc(ref, draftSave({}, { id: 'other' })));
    await assertFails(
      updateDoc(ref, draftSave({}, { chapters: Array.from({ length: 31 }, () => 1) })),
    );
    await assertFails(updateDoc(ref, draftSave({}, { chapters: 'x' })));
    await assertFails(updateDoc(ref, draftSave({ answers: 'x' })));
  });

  it('is never created or deleted by a client', async () => {
    await assertFails(setDoc(doc(asha(), 'courses/wip/drafts/other'), draftSave({ rev: 1 })));
    await assertFails(setDoc(doc(ajay(), 'courses/wip/drafts/other'), draftSave({ rev: 1 })));
    await assertFails(deleteDoc(doc(asha(), 'courses/wip/drafts/current')));
    await assertFails(deleteDoc(doc(ajay(), 'courses/wip/drafts/current')));
  });
});

describe('courses/{id}/versions/{n}', () => {
  it('is read by the course Educator and an Admin only', async () => {
    await assertSucceeds(getDoc(doc(asha(), 'courses/wip/versions/1')));
    await assertSucceeds(getDoc(doc(ajay(), 'courses/wip/versions/1')));
    await assertFails(getDoc(doc(rohan(), 'courses/wip/versions/1')));
    await assertFails(getDoc(doc(priya(), 'courses/wip/versions/1')));
  });
  it('takes no client writes', async () => {
    await assertFails(setDoc(doc(asha(), 'courses/wip/versions/2'), { version: 2 }));
    await assertFails(setDoc(doc(ajay(), 'courses/wip/versions/2'), { version: 2 }));
    await assertFails(deleteDoc(doc(ajay(), 'courses/wip/versions/1')));
  });
});

describe('courses/{id}/learners/{uid}', () => {
  it('is read by the course Educator and an Admin', async () => {
    await assertSucceeds(getDoc(doc(asha(), 'courses/wip/learners/priya')));
    await assertSucceeds(getDocs(collection(asha(), 'courses/wip/learners')));
    await assertSucceeds(getDoc(doc(ajay(), 'courses/wip/learners/priya')));
  });
  it('denies another course’s Educator, a learner and a signed-out reader', async () => {
    await assertFails(getDoc(doc(rohan(), 'courses/wip/learners/priya')));
    await assertFails(getDocs(collection(rohan(), 'courses/wip/learners')));
    await assertFails(getDoc(doc(priya(), 'courses/wip/learners/priya')));
    await assertFails(
      getDoc(doc(env.unauthenticatedContext().firestore(), 'courses/wip/learners/priya')),
    );
    await assertFails(
      getDoc(
        doc(as('asha', { educator: true, email: 'a@gmail.com' }), 'courses/wip/learners/priya'),
      ),
    );
  });
  it('takes no client writes', async () => {
    await assertFails(setDoc(doc(asha(), 'courses/wip/learners/rohan'), { displayName: 'R' }));
    await assertFails(setDoc(doc(ajay(), 'courses/wip/learners/rohan'), { displayName: 'R' }));
    await assertFails(deleteDoc(doc(ajay(), 'courses/wip/learners/priya')));
  });
});

describe('questionBank/{id}', () => {
  it('is read by anyone holding the educator or admin claim, never a learner', async () => {
    await assertSucceeds(getDoc(doc(rohan(), 'questionBank/b1')));
    await assertSucceeds(getDoc(doc(ajay(), 'questionBank/b1')));
    await assertFails(getDoc(doc(priya(), 'questionBank/b1')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'questionBank/b1')));
    await assertFails(
      getDoc(doc(as('rohan', { educator: true, email: 'r@gmail.com' }), 'questionBank/b1')),
    );
  });

  it('is created by an Educator or Admin with their own uid and the server time', async () => {
    await assertSucceeds(setDoc(doc(rohan(), 'questionBank/b2'), bankEntry('rohan')));
    await assertSucceeds(setDoc(doc(ajay(), 'questionBank/b3'), bankEntry('ajay')));
  });

  it('denies a learner, a forged author or time, extra keys and bad types', async () => {
    await assertFails(setDoc(doc(priya(), 'questionBank/b2'), bankEntry('priya')));
    await assertFails(setDoc(doc(rohan(), 'questionBank/b2'), bankEntry('asha')));
    await assertFails(
      setDoc(doc(rohan(), 'questionBank/b2'), bankEntry('rohan', { createdAt: new Date() })),
    );
    await assertFails(setDoc(doc(rohan(), 'questionBank/b2'), bankEntry('rohan', { extra: 1 })));
    await assertFails(
      setDoc(doc(rohan(), 'questionBank/b2'), bankEntry('rohan', { question: 'x' })),
    );
    await assertFails(
      setDoc(doc(rohan(), 'questionBank/b2'), bankEntry('rohan', { answers: 'a' })),
    );
    await assertFails(setDoc(doc(rohan(), 'questionBank/b2'), bankEntry('rohan', { tags: 'a' })));
  });

  it('is deleted by its creator or an Admin, not by another Educator or a learner', async () => {
    await assertFails(deleteDoc(doc(rohan(), 'questionBank/b1')));
    await assertFails(deleteDoc(doc(priya(), 'questionBank/b1')));
    await assertSucceeds(deleteDoc(doc(asha(), 'questionBank/b1')));
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'questionBank/b1'), bankEntry('asha', { createdAt: new Date() })),
    );
    await assertSucceeds(deleteDoc(doc(ajay(), 'questionBank/b1')));
  });

  it('is never updated', async () => {
    await assertFails(updateDoc(doc(asha(), 'questionBank/b1'), { tags: ['x'] }));
    await assertFails(updateDoc(doc(ajay(), 'questionBank/b1'), { tags: ['x'] }));
  });
});
