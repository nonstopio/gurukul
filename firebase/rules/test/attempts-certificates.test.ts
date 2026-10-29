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
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { nonstop, startEnv } from './helpers';

let env: RulesTestEnvironment;
const as = (uid: string, claims: Record<string, unknown> = {}) => nonstop(env, uid, claims);
const attempt = 'progress/priya_git/attempts/a1';
const cert = (id: string, uid: string) => ({
  id,
  uid,
  learnerName: 'Priya',
  courseId: 'git',
  courseTitle: 'Git',
  courseVersion: 1,
  signatoryName: 'A',
  signatoryRole: 'K',
  revoked: false,
});

beforeAll(async () => {
  env = await startEnv();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'courses/git'), { status: 'published', educatorIds: ['asha'] });
    await setDoc(doc(db, 'progress/priya_git'), { uid: 'priya', courseId: 'git' });
    await setDoc(doc(db, attempt), {
      uid: 'priya',
      courseId: 'git',
      quizId: 'pk',
      score: 0.5,
    });
    await setDoc(doc(db, 'certificates/NSG-GIT-26-0001'), cert('NSG-GIT-26-0001', 'priya'));
    await setDoc(doc(db, 'certificates/NSG-GIT-26-0002'), cert('NSG-GIT-26-0002', 'ravi'));
    await setDoc(doc(db, 'counters/certificates'), { '2026': 2 });
  });
});
afterAll(async () => {
  await env.cleanup();
});

describe('progress/{id}/attempts/{attemptId}', () => {
  it('lets the learner, an Admin and the course’s Educator read an attempt', async () => {
    await assertSucceeds(getDoc(doc(as('priya'), attempt)));
    await assertSucceeds(getDoc(doc(as('root', { admin: true }), attempt)));
    await assertSucceeds(getDoc(doc(as('asha', { educator: true }), attempt)));
  });

  it('denies other learners, other Educators, a bare claim without the course and signed-out users', async () => {
    await assertFails(getDoc(doc(as('ravi'), attempt)));
    await assertFails(getDoc(doc(as('bhav', { educator: true }), attempt)));
    await assertFails(getDoc(doc(as('asha'), attempt)));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), attempt)));
  });

  it('lets the learner query their latest attempt at a Quiz, and nobody query without the uid', async () => {
    const latest = (db: ReturnType<typeof as>, uid?: string) =>
      getDocs(
        query(
          collection(db, 'progress/priya_git/attempts'),
          ...(uid ? [where('uid', '==', uid)] : []),
          where('quizId', '==', 'pk'),
          orderBy('createdAt', 'desc'),
          limit(1),
        ),
      );
    await assertSucceeds(latest(as('priya'), 'priya'));
    await assertFails(latest(as('priya')));
    await assertFails(latest(as('ravi'), 'priya'));
  });

  it('lets an Admin query a learner’s attempt history (the learner drawer), and not another learner', async () => {
    const history = (db: ReturnType<typeof as>) =>
      getDocs(
        query(
          collection(db, 'progress/priya_git/attempts'),
          where('uid', '==', 'priya'),
          where('quizId', '==', 'pk'),
          orderBy('createdAt', 'desc'),
          limit(10),
        ),
      );
    await assertSucceeds(history(as('root', { admin: true })));
    await assertFails(history(as('ravi')));
  });

  it('denies every client write, even from the owner or an Admin', async () => {
    for (const db of [as('priya'), as('root', { admin: true })]) {
      await assertFails(setDoc(doc(db, 'progress/priya_git/attempts/a2'), { uid: 'priya' }));
      await assertFails(updateDoc(doc(db, attempt), { score: 1 }));
      await assertFails(deleteDoc(doc(db, attempt)));
    }
  });
});

describe('certificates/{id}', () => {
  const id = 'certificates/NSG-GIT-26-0001';

  it('lets anyone get one by id, signed in or not, and it exists to verify', async () => {
    await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), id)));
    await assertSucceeds(getDoc(doc(as('ravi'), id)));
  });

  it('lets an owner list their own and an Admin list any', async () => {
    const mine = query(collection(as('priya'), 'certificates'), where('uid', '==', 'priya'));
    await assertSucceeds(getDocs(mine));
    const theirs = query(
      collection(as('root', { admin: true }), 'certificates'),
      where('uid', '==', 'ravi'),
    );
    await assertSucceeds(getDocs(theirs));
    await assertSucceeds(getDocs(collection(as('root', { admin: true }), 'certificates')));
  });

  it('denies listing someone else’s, listing everything, and listing signed out', async () => {
    const theirs = query(collection(as('priya'), 'certificates'), where('uid', '==', 'ravi'));
    await assertFails(getDocs(theirs));
    await assertFails(getDocs(collection(as('priya'), 'certificates')));
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(
      getDocs(query(collection(anon, 'certificates'), where('uid', '==', 'priya'))),
    );
  });

  it('denies every client write, even from the owner, an Admin or a signed-out user', async () => {
    for (const db of [
      as('priya'),
      as('root', { admin: true }),
      env.unauthenticatedContext().firestore(),
    ]) {
      await assertFails(
        setDoc(doc(db, 'certificates/NSG-GIT-26-0009'), cert('NSG-GIT-26-0009', 'priya')),
      );
      await assertFails(updateDoc(doc(db, id), { revoked: true }));
      await assertFails(deleteDoc(doc(db, id)));
    }
  });
});

describe('counters/{doc}', () => {
  it('is closed to every client, Admins included', async () => {
    for (const db of [as('priya'), as('root', { admin: true })]) {
      await assertFails(getDoc(doc(db, 'counters/certificates')));
      await assertFails(setDoc(doc(db, 'counters/certificates'), { '2026': 0 }));
    }
  });
});
