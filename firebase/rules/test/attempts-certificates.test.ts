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
    await setDoc(doc(db, 'courses/git'), { status: 'published', acharyaIds: ['asha'] });
    await setDoc(doc(db, 'progress/priya_git'), { uid: 'priya', courseId: 'git' });
    await setDoc(doc(db, attempt), {
      uid: 'priya',
      courseId: 'git',
      parikshaId: 'pk',
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
  it('lets the learner, a Kulapati and the course’s Acharya read an attempt', async () => {
    await assertSucceeds(getDoc(doc(as('priya'), attempt)));
    await assertSucceeds(getDoc(doc(as('root', { kulapati: true }), attempt)));
    await assertSucceeds(getDoc(doc(as('asha', { acharya: true }), attempt)));
  });

  it('denies other learners, other Acharyas, a bare claim without the course and signed-out users', async () => {
    await assertFails(getDoc(doc(as('ravi'), attempt)));
    await assertFails(getDoc(doc(as('bhav', { acharya: true }), attempt)));
    await assertFails(getDoc(doc(as('asha'), attempt)));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), attempt)));
  });

  it('lets the learner query their latest attempt at a Pariksha, and nobody query without the uid', async () => {
    const latest = (db: ReturnType<typeof as>, uid?: string) =>
      getDocs(
        query(
          collection(db, 'progress/priya_git/attempts'),
          ...(uid ? [where('uid', '==', uid)] : []),
          where('parikshaId', '==', 'pk'),
          orderBy('createdAt', 'desc'),
          limit(1),
        ),
      );
    await assertSucceeds(latest(as('priya'), 'priya'));
    await assertFails(latest(as('priya')));
    await assertFails(latest(as('ravi'), 'priya'));
  });

  it('denies every client write, even from the owner or a Kulapati', async () => {
    for (const db of [as('priya'), as('root', { kulapati: true })]) {
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

  it('lets an owner list their own and a Kulapati list any', async () => {
    const mine = query(collection(as('priya'), 'certificates'), where('uid', '==', 'priya'));
    await assertSucceeds(getDocs(mine));
    const theirs = query(
      collection(as('root', { kulapati: true }), 'certificates'),
      where('uid', '==', 'ravi'),
    );
    await assertSucceeds(getDocs(theirs));
    await assertSucceeds(getDocs(collection(as('root', { kulapati: true }), 'certificates')));
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

  it('denies every client write, even from the owner, a Kulapati or a signed-out user', async () => {
    for (const db of [
      as('priya'),
      as('root', { kulapati: true }),
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
  it('is closed to every client, Kulapatis included', async () => {
    for (const db of [as('priya'), as('root', { kulapati: true })]) {
      await assertFails(getDoc(doc(db, 'counters/certificates')));
      await assertFails(setDoc(doc(db, 'counters/certificates'), { '2026': 0 }));
    }
  });
});
