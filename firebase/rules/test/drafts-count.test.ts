import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  collection,
  doc,
  getCountFromServer,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { nonstop, startEnv } from './helpers';

// Studio's course list asks "was this draft saved after the last publish?" with a count of the
// course's drafts newer than `publishedAt`: no draft document is downloaded. The rules must answer
// it for exactly the people who may read the draft.
let env: RulesTestEnvironment;
const as = (uid: string, claims: Record<string, unknown> = {}) => nonstop(env, uid, claims);
const published = Timestamp.fromMillis(1_000);
const editedSince = (db: ReturnType<typeof as>, courseId: string) =>
  getCountFromServer(
    query(collection(db, 'courses', courseId, 'drafts'), where('updatedAt', '>', published)),
  );

beforeAll(async () => {
  env = await startEnv();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [id, saved] of [
      ['edited', 2_000],
      ['clean', 500],
    ] as const) {
      await setDoc(doc(db, 'courses', id), { status: 'published', educatorIds: ['asha'] });
      await setDoc(doc(db, 'courses', id, 'drafts', 'current'), {
        rev: 1,
        updatedAt: Timestamp.fromMillis(saved),
      });
    }
  });
});
afterAll(async () => {
  await env.cleanup();
});

describe('counting a course’s drafts saved after its last publish', () => {
  it('answers the course’s Educator and an Admin: one when edited since, none when not', async () => {
    for (const db of [as('asha', { educator: true }), as('ajay', { admin: true })]) {
      expect((await editedSince(db, 'edited')).data().count).toBe(1);
      expect((await editedSince(db, 'clean')).data().count).toBe(0);
    }
  });

  it('refuses another Educator, a learner and a signed-out visitor', async () => {
    await assertFails(editedSince(as('rohan', { educator: true }), 'edited'));
    await assertFails(editedSince(as('priya'), 'edited'));
    await assertFails(editedSince(env.unauthenticatedContext().firestore() as never, 'edited'));
    await assertSucceeds(editedSince(as('asha', { educator: true }), 'edited'));
  });
});
