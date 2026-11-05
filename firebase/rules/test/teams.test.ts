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
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { nonstop, startEnv } from './helpers';

let env: RulesTestEnvironment;
const as = (uid: string, claims: Record<string, unknown> = {}) => nonstop(env, uid, claims);
const admin = () => as('ajay', { admin: true });
// Mona manages `sales`; `platform` has no manager (Admin-only to edit).
const mona = () => as('mona', { manager: true });
const MONA = 'mona@nonstopio.com';
const valid = {
  name: 'Platform',
  memberEmails: ['priya@example.com', 'rohan@example.com'],
  createdAt: 1_700_000_000_000,
};

beforeAll(async () => {
  env = await startEnv();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'teams/platform'), valid);
    await setDoc(doc(ctx.firestore(), 'teams/mine'), { ...valid, createdBy: 'meera' });
    await setDoc(doc(ctx.firestore(), 'teams/sales'), {
      ...valid,
      name: 'Sales',
      createdBy: 'mona',
      managerEmails: [MONA, 'ravi@nonstopio.com'],
    });
    await setDoc(doc(ctx.firestore(), 'teams/educator-candidates'), {
      ...valid,
      name: 'Educator candidates',
      managerEmails: [MONA],
    });
  });
});
afterAll(async () => {
  await env.cleanup();
});

describe('teams/{id}', () => {
  it('lets an admin read, create as its creator, edit any team, set managers and delete', async () => {
    await assertSucceeds(getDoc(doc(admin(), 'teams/platform')));
    await assertSucceeds(
      setDoc(doc(admin(), 'teams/qa'), { ...valid, name: 'QA', createdBy: 'ajay' }),
    );
    await assertSucceeds(updateDoc(doc(admin(), 'teams/platform'), { memberEmails: [] }));
    await assertSucceeds(updateDoc(doc(admin(), 'teams/platform'), { managerEmails: [MONA] }));
    await assertSucceeds(updateDoc(doc(admin(), 'teams/sales'), { managerEmails: [] }));
    await assertSucceeds(deleteDoc(doc(admin(), 'teams/platform')));
  });
  it('makes every new team name its creator, and nobody changes the creator', async () => {
    await assertFails(setDoc(doc(admin(), 'teams/qa'), { ...valid, name: 'QA' }));
    await assertFails(
      setDoc(doc(admin(), 'teams/qa'), { ...valid, name: 'QA', createdBy: 'meera' }),
    );
    await assertFails(updateDoc(doc(admin(), 'teams/mine'), { createdBy: 'ajay' }));
    await assertFails(updateDoc(doc(admin(), 'teams/platform'), { createdBy: 'ajay' }));
    await assertFails(updateDoc(doc(mona(), 'teams/sales'), { createdBy: 'ravi' }));
  });
  it('lets an educator read every team but no longer create, edit or delete one', async () => {
    const db = as('meera', { educator: true });
    await assertSucceeds(getDoc(doc(db, 'teams/platform')));
    await assertSucceeds(getDoc(doc(db, 'teams/sales')));
    await assertFails(setDoc(doc(db, 'teams/qa'), { ...valid, name: 'QA', createdBy: 'meera' }));
    await assertFails(updateDoc(doc(db, 'teams/mine'), { memberEmails: [] }));
    await assertFails(deleteDoc(doc(db, 'teams/mine')));
  });
  it('lets a manager read the teams that list them, by a query that asks for exactly those', async () => {
    await assertSucceeds(getDoc(doc(mona(), 'teams/sales')));
    await assertSucceeds(
      getDocs(query(collection(mona(), 'teams'), where('managerEmails', 'array-contains', MONA))),
    );
  });
  it('compares the manager email lower-cased, as stored', async () => {
    const upper = as('mona', { manager: true, email: 'Mona@NonStopIO.com' });
    await assertSucceeds(getDoc(doc(upper, 'teams/sales')));
  });
  it('denies a manager every other team, a listing of all teams and a manager without the claim', async () => {
    await assertFails(getDoc(doc(mona(), 'teams/platform')));
    await assertFails(getDocs(collection(mona(), 'teams')));
    await assertFails(getDoc(doc(as('mona'), 'teams/sales')));
  });
  it('lets a manager create a team that lists them, and edit its members', async () => {
    await assertSucceeds(
      setDoc(doc(mona(), 'teams/support'), {
        ...valid,
        name: 'Support',
        createdBy: 'mona',
        managerEmails: [MONA],
      }),
    );
    await assertSucceeds(
      updateDoc(doc(mona(), 'teams/sales'), { memberEmails: ['new@example.com'], name: 'Sales 2' }),
    );
  });
  it('denies a manager a team without them, a change of managers and a delete', async () => {
    await assertFails(
      setDoc(doc(mona(), 'teams/support'), { ...valid, name: 'Support', createdBy: 'mona' }),
    );
    await assertFails(
      setDoc(doc(mona(), 'teams/support'), {
        ...valid,
        name: 'Support',
        createdBy: 'mona',
        managerEmails: ['ravi@nonstopio.com'],
      }),
    );
    await assertFails(updateDoc(doc(mona(), 'teams/sales'), { managerEmails: [MONA] }));
    await assertFails(
      updateDoc(doc(mona(), 'teams/sales'), {
        managerEmails: [MONA, 'ravi@nonstopio.com', 'new@nonstopio.com'],
      }),
    );
    await assertFails(updateDoc(doc(mona(), 'teams/platform'), { memberEmails: [] }));
    await assertFails(deleteDoc(doc(mona(), 'teams/sales')));
  });
  it('keeps the Educator course team Admin-only, whatever its managers say', async () => {
    const team = { ...valid, name: 'Educator candidates' };
    await assertFails(
      updateDoc(doc(mona(), 'teams/educator-candidates'), { memberEmails: [MONA] }),
    );
    await env.withSecurityRulesDisabled((ctx) =>
      deleteDoc(doc(ctx.firestore(), 'teams/educator-candidates')),
    );
    await assertFails(
      setDoc(doc(mona(), 'teams/educator-candidates'), {
        ...team,
        createdBy: 'mona',
        managerEmails: [MONA],
      }),
    );
    await assertFails(
      setDoc(doc(as('meera', { educator: true }), 'teams/educator-candidates'), {
        ...team,
        createdBy: 'meera',
      }),
    );
    await assertSucceeds(
      setDoc(doc(admin(), 'teams/educator-candidates'), { ...team, createdBy: 'ajay' }),
    );
  });
  it('denies a learner, another domain and a signed-out visitor every operation', async () => {
    const others = [
      as('priya'),
      as('priya', { email: 'p@gmail.com', educator: true }),
      as('priya', { email: 'p@gmail.com', admin: true }),
      as('mona', { email: 'mona@gmail.com', manager: true }),
      env.unauthenticatedContext().firestore(),
    ];
    for (const db of others) {
      await assertFails(getDoc(doc(db, 'teams/platform')));
      await assertFails(setDoc(doc(db, 'teams/qa'), valid));
      await assertFails(updateDoc(doc(db, 'teams/platform'), { memberEmails: [] }));
      await assertFails(deleteDoc(doc(db, 'teams/platform')));
    }
  });
  it('denies a bad shape: extra or missing keys, wrong types, long names, too many people', async () => {
    const bad = [
      { ...valid, extra: 1 },
      { name: valid.name, memberEmails: valid.memberEmails },
      { ...valid, name: '' },
      { ...valid, name: 'x'.repeat(81) },
      { ...valid, name: 1 },
      { ...valid, memberEmails: 'priya@example.com' },
      { ...valid, memberEmails: Array.from({ length: 501 }, (_, i) => `p${i}@example.com`) },
      { ...valid, managerEmails: MONA },
      { ...valid, managerEmails: Array.from({ length: 11 }, (_, i) => `m${i}@nonstopio.com`) },
      { ...valid, createdAt: 'now' },
    ];
    for (const data of bad) {
      await assertFails(setDoc(doc(admin(), 'teams/qa'), { createdBy: 'ajay', ...data }));
    }
    await assertFails(setDoc(doc(admin(), 'teams/qa'), { ...valid, createdBy: 1 }));
  });
  it('allows exactly 500 members and 10 managers', async () => {
    await assertSucceeds(
      setDoc(doc(admin(), 'teams/big'), {
        ...valid,
        createdBy: 'ajay',
        memberEmails: Array.from({ length: 500 }, (_, i) => `p${i}@example.com`),
        managerEmails: Array.from({ length: 10 }, (_, i) => `m${i}@nonstopio.com`),
      }),
    );
  });
});
