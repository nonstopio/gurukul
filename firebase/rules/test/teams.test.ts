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
  await env.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), 'teams/platform'), valid),
  );
});
afterAll(async () => {
  await env.cleanup();
});

describe('teams/{id}', () => {
  it('lets an admin read, create, update and delete a team', async () => {
    await assertSucceeds(getDoc(doc(admin(), 'teams/platform')));
    await assertSucceeds(setDoc(doc(admin(), 'teams/qa'), { ...valid, name: 'QA' }));
    await assertSucceeds(updateDoc(doc(admin(), 'teams/platform'), { memberEmails: [] }));
    await assertSucceeds(deleteDoc(doc(admin(), 'teams/platform')));
  });
  it('lets an educator read, create, update and delete a team', async () => {
    const db = as('meera', { educator: true });
    await assertSucceeds(getDoc(doc(db, 'teams/platform')));
    await assertSucceeds(setDoc(doc(db, 'teams/qa'), { ...valid, name: 'QA' }));
    await assertSucceeds(updateDoc(doc(db, 'teams/platform'), { memberEmails: [] }));
    await assertSucceeds(deleteDoc(doc(db, 'teams/platform')));
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
    for (const data of bad) await assertFails(setDoc(doc(admin(), 'teams/qa'), data));
  });
  it('allows exactly 500 members', async () => {
    await assertSucceeds(
      setDoc(doc(admin(), 'teams/big'), {
        ...valid,
        memberEmails: Array.from({ length: 500 }, (_, i) => `p${i}@example.com`),
      }),
    );
  });
});
