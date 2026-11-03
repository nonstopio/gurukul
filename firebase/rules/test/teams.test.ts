import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { nonstop, startEnv } from './helpers';

let env: RulesTestEnvironment;
const as = (uid: string, claims: Record<string, unknown> = {}) => nonstop(env, uid, claims);
const admin = () => as('ajay', { admin: true });
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
  // `platform` predates creators (Admin-only to edit); `mine` is Meera's, `ravis` is Ravi's.
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'teams/platform'), valid);
    await setDoc(doc(ctx.firestore(), 'teams/mine'), { ...valid, createdBy: 'meera' });
    await setDoc(doc(ctx.firestore(), 'teams/ravis'), { ...valid, createdBy: 'ravi' });
  });
});
afterAll(async () => {
  await env.cleanup();
});

describe('teams/{id}', () => {
  it('lets an admin read, create as its creator, edit any team and delete one', async () => {
    await assertSucceeds(getDoc(doc(admin(), 'teams/platform')));
    await assertSucceeds(
      setDoc(doc(admin(), 'teams/qa'), { ...valid, name: 'QA', createdBy: 'ajay' }),
    );
    await assertSucceeds(updateDoc(doc(admin(), 'teams/platform'), { memberEmails: [] }));
    await assertSucceeds(updateDoc(doc(admin(), 'teams/ravis'), { memberEmails: [] }));
    await assertSucceeds(deleteDoc(doc(admin(), 'teams/platform')));
  });
  it('makes every new team name its creator, and nobody changes the creator', async () => {
    await assertFails(setDoc(doc(admin(), 'teams/qa'), { ...valid, name: 'QA' }));
    await assertFails(
      setDoc(doc(admin(), 'teams/qa'), { ...valid, name: 'QA', createdBy: 'meera' }),
    );
    await assertFails(updateDoc(doc(admin(), 'teams/ravis'), { createdBy: 'ajay' }));
    await assertFails(updateDoc(doc(admin(), 'teams/platform'), { createdBy: 'ajay' }));
    const meera = as('meera', { educator: true });
    await assertFails(updateDoc(doc(meera, 'teams/mine'), { createdBy: 'ravi' }));
  });
  it('lets an educator read any team, create one and edit their own, but not delete', async () => {
    const db = as('meera', { educator: true });
    await assertSucceeds(getDoc(doc(db, 'teams/platform')));
    await assertSucceeds(setDoc(doc(db, 'teams/qa'), { ...valid, name: 'QA', createdBy: 'meera' }));
    await assertSucceeds(updateDoc(doc(db, 'teams/mine'), { memberEmails: [] }));
    await assertFails(deleteDoc(doc(db, 'teams/mine')));
  });
  it('lets only an admin make the Educator course team again', async () => {
    const team = { ...valid, name: 'Educator candidates' };
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
  it("denies an educator another educator's team and one made before creators", async () => {
    const db = as('meera', { educator: true });
    await assertFails(updateDoc(doc(db, 'teams/ravis'), { memberEmails: [] }));
    await assertFails(updateDoc(doc(db, 'teams/platform'), { memberEmails: [] }));
  });
  it('denies a learner, another domain and a signed-out visitor every operation', async () => {
    const others = [
      as('priya'),
      as('priya', { email: 'p@gmail.com', educator: true }),
      as('priya', { email: 'p@gmail.com', admin: true }),
      env.unauthenticatedContext().firestore(),
    ];
    for (const db of others) {
      await assertFails(getDoc(doc(db, 'teams/platform')));
      await assertFails(setDoc(doc(db, 'teams/qa'), valid));
      await assertFails(updateDoc(doc(db, 'teams/platform'), { memberEmails: [] }));
      await assertFails(deleteDoc(doc(db, 'teams/platform')));
    }
  });
  it('denies a bad shape: extra or missing keys, wrong types, long names, too many members', async () => {
    const bad = [
      { ...valid, extra: 1 },
      { name: valid.name, memberEmails: valid.memberEmails },
      { ...valid, name: '' },
      { ...valid, name: 'x'.repeat(81) },
      { ...valid, name: 1 },
      { ...valid, memberEmails: 'priya@example.com' },
      { ...valid, memberEmails: Array.from({ length: 501 }, (_, i) => `p${i}@example.com`) },
      { ...valid, createdAt: 'now' },
    ];
    for (const data of bad) {
      await assertFails(setDoc(doc(admin(), 'teams/qa'), { createdBy: 'ajay', ...data }));
    }
    await assertFails(setDoc(doc(admin(), 'teams/qa'), { ...valid, createdBy: 1 }));
  });
  it('allows exactly 500 members', async () => {
    await assertSucceeds(
      setDoc(doc(admin(), 'teams/big'), {
        ...valid,
        createdBy: 'ajay',
        memberEmails: Array.from({ length: 500 }, (_, i) => `p${i}@example.com`),
      }),
    );
  });
});
