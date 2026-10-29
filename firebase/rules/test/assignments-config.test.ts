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

beforeAll(async () => {
  env = await startEnv();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'assignments/git__abc'), {
      email: 'priya@nonstopio.com',
      uid: 'priya',
      courseId: 'git',
    });
    await setDoc(doc(db, 'assignments/git__def'), {
      email: 'new@nonstopio.com',
      uid: null,
      courseId: 'git',
    });
    await setDoc(doc(db, 'config/org'), { domain: 'nonstopio.com', teams: ['QA'] });
  });
});
afterAll(async () => {
  await env.cleanup();
});

describe('assignments/{id}', () => {
  it('lets the assignee read their own assignment', async () => {
    await assertSucceeds(getDoc(doc(as('priya'), 'assignments/git__abc')));
  });
  it("denies reading someone else's or a not-yet-claimed assignment", async () => {
    await assertFails(getDoc(doc(as('rohan'), 'assignments/git__abc')));
    await assertFails(getDoc(doc(as('rohan'), 'assignments/git__def')));
  });
  it('lets a kulapati read any assignment', async () => {
    await assertSucceeds(getDoc(doc(as('ajay', { kulapati: true }), 'assignments/git__def')));
  });
  it('denies signed-out reads and every client write', async () => {
    await assertFails(
      getDoc(doc(env.unauthenticatedContext().firestore(), 'assignments/git__abc')),
    );
    await assertFails(
      setDoc(doc(as('ajay', { kulapati: true }), 'assignments/x'), { uid: 'ajay' }),
    );
    await assertFails(updateDoc(doc(as('priya'), 'assignments/git__abc'), { status: 'completed' }));
  });
});

describe('config/org', () => {
  const kulapati = () => as('ajay', { kulapati: true });
  const valid = { domain: 'nonstopio.com', teams: ['QA', 'Dev'], reminders: { enabled: true } };

  it('lets any signed-in NonStop account read it', async () => {
    await assertSucceeds(getDoc(doc(as('priya'), 'config/org')));
  });
  it('denies signed-out and non-NonStop reads', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'config/org')));
    await assertFails(getDoc(doc(as('priya', { email: 'p@gmail.com' }), 'config/org')));
  });
  it('lets a kulapati create it and save teams and reminders', async () => {
    await env.withSecurityRulesDisabled((ctx) => deleteDoc(doc(ctx.firestore(), 'config/org')));
    await assertSucceeds(setDoc(doc(kulapati(), 'config/org'), valid));
    await assertSucceeds(
      updateDoc(doc(kulapati(), 'config/org'), { teams: [], 'reminders.enabled': false }),
    );
  });
  it('denies writes by a learner or an acharya', async () => {
    await assertFails(updateDoc(doc(as('priya'), 'config/org'), { teams: [] }));
    await assertFails(setDoc(doc(as('priya', { acharya: true }), 'config/org'), valid));
  });
  it('denies a bad shape: extra keys, another domain, wrong types, too many teams', async () => {
    const bad = [
      { ...valid, extra: 1 },
      { ...valid, domain: 'example.com' },
      { ...valid, teams: 'QA' },
      { ...valid, teams: Array.from({ length: 101 }, (_, i) => `Team ${i}`) },
      { ...valid, reminders: true },
      { ...valid, reminders: { enabled: true, hour: 4 } },
      { ...valid, reminders: { enabled: 'yes' } },
    ];
    for (const data of bad) await assertFails(setDoc(doc(kulapati(), 'config/org'), data));
  });
  it('denies deleting it, and any other config document', async () => {
    await assertFails(deleteDoc(doc(kulapati(), 'config/org')));
    await assertFails(setDoc(doc(kulapati(), 'config/other'), valid));
    await assertFails(getDoc(doc(as('priya'), 'config/other')));
  });
});
