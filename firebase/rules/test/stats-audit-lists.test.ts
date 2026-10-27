import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { nonstop, startEnv } from './helpers';

let env: RulesTestEnvironment;
const as = (uid: string, claims: Record<string, unknown> = {}) => nonstop(env, uid, claims);

beforeAll(async () => {
  env = await startEnv();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'courses/git'), { status: 'published', acharyaIds: ['asha'] });
    await setDoc(doc(db, 'courses/sql'), { status: 'published', acharyaIds: [] });
    await setDoc(doc(db, 'stats/org'), { started: 3 });
    await setDoc(doc(db, 'stats/course_git'), { started: 2 });
    await setDoc(doc(db, 'stats/course_sql'), { started: 1 });
    await setDoc(doc(db, 'audit/a1'), { action: 'assign', by: 'ajay' });
    await setDoc(doc(db, 'mail/m1'), { to: 'a@example.com', state: 'pending' });
    await setDoc(doc(db, 'users/priya'), { email: 'priya@nonstopio.com', roles: ['shishya'] });
    await setDoc(doc(db, 'users/rohan'), { email: 'rohan@nonstopio.com', roles: ['shishya'] });
    await setDoc(doc(db, 'assignments/git__a'), {
      email: 'priya@nonstopio.com',
      uid: 'priya',
      courseId: 'git',
    });
    await setDoc(doc(db, 'assignments/git__b'), {
      email: 'rohan@nonstopio.com',
      uid: 'rohan',
      courseId: 'git',
    });
  });
});
afterAll(async () => {
  await env.cleanup();
});

describe('stats/{scope}', () => {
  it('lets a Kulapati read the org and every course’s counters', async () => {
    const db = as('ajay', { kulapati: true });
    await assertSucceeds(getDoc(doc(db, 'stats/org')));
    await assertSucceeds(getDoc(doc(db, 'stats/course_git')));
    await assertSucceeds(getDoc(doc(db, 'stats/course_sql')));
  });

  it('lets a course’s Acharya read that course’s counters only', async () => {
    const db = as('asha', { acharya: true });
    await assertSucceeds(getDoc(doc(db, 'stats/course_git')));
    await assertFails(getDoc(doc(db, 'stats/course_sql')));
    await assertFails(getDoc(doc(db, 'stats/org')));
  });

  it('denies a learner, an Acharya claim without the grant, and signed-out reads', async () => {
    await assertFails(getDoc(doc(as('priya'), 'stats/org')));
    await assertFails(getDoc(doc(as('priya'), 'stats/course_git')));
    await assertFails(getDoc(doc(as('asha'), 'stats/course_git')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'stats/org')));
  });

  it('denies every client write, even a Kulapati’s', async () => {
    const db = as('ajay', { kulapati: true });
    await assertFails(setDoc(doc(db, 'stats/org'), { started: 99 }));
    await assertFails(updateDoc(doc(db, 'stats/course_git'), { started: 99 }));
    await assertFails(
      setDoc(doc(as('asha', { acharya: true }), 'stats/course_git'), { started: 9 }),
    );
  });
});

describe('audit/{id}', () => {
  it('lets a Kulapati read an entry', async () => {
    await assertSucceeds(getDoc(doc(as('ajay', { kulapati: true }), 'audit/a1')));
  });

  it('denies everyone else, and every write', async () => {
    await assertFails(getDoc(doc(as('priya'), 'audit/a1')));
    await assertFails(getDoc(doc(as('asha', { acharya: true }), 'audit/a1')));
    await assertFails(setDoc(doc(as('ajay', { kulapati: true }), 'audit/a2'), { action: 'x' }));
    await assertFails(updateDoc(doc(as('ajay', { kulapati: true }), 'audit/a1'), { action: 'x' }));
  });
});

describe('mail/{id}', () => {
  it('is closed to every client, Kulapatis included', async () => {
    for (const db of [
      as('ajay', { kulapati: true }),
      as('priya'),
      env.unauthenticatedContext().firestore(),
    ]) {
      await assertFails(getDoc(doc(db, 'mail/m1')));
      await assertFails(setDoc(doc(db, 'mail/m2'), { to: 'a@example.com' }));
    }
  });
});

describe('listing users', () => {
  it('lets a Kulapati list a page of users', async () => {
    const db = as('ajay', { kulapati: true });
    await assertSucceeds(getDocs(query(collection(db, 'users'), limit(25))));
  });

  it('denies a Shishya listing users', async () => {
    await assertFails(getDocs(query(collection(as('priya'), 'users'), limit(25))));
  });
});

describe('listing assignments', () => {
  it('lets a Kulapati list a course’s assignments', async () => {
    const db = as('ajay', { kulapati: true });
    await assertSucceeds(
      getDocs(query(collection(db, 'assignments'), where('courseId', '==', 'git'))),
    );
  });

  it('lets a Shishya list their own assignments but not others’', async () => {
    const db = as('priya');
    await assertSucceeds(
      getDocs(query(collection(db, 'assignments'), where('uid', '==', 'priya'))),
    );
    await assertFails(
      getDocs(query(collection(db, 'assignments'), where('courseId', '==', 'git'))),
    );
    await assertFails(getDocs(query(collection(db, 'assignments'), where('uid', '==', 'rohan'))));
  });
});
