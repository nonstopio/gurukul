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
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { nonstop, startEnv } from './helpers';

// `courseSummaries/{id}` must open for exactly the people `courses/{id}` opens for. Every case
// here is asked of both collections, seeded with the same access fields, and must get one answer.
let env: RulesTestEnvironment;
const as = (uid: string, claims: Record<string, unknown> = {}) => nonstop(env, uid, claims);
const BOTH = ['courses', 'courseSummaries'] as const;

const SEED = {
  open: { status: 'published', visibility: 'public', visibleTeamIds: [] },
  plat: { status: 'published', visibility: 'teams', visibleTeamIds: ['platform'] },
  qa: { status: 'archived', visibility: 'teams', visibleTeamIds: ['qa'] },
  staff: { status: 'published', visibility: 'staff', visibleTeamIds: [] },
  wip: { status: 'draft', visibility: 'public', visibleTeamIds: [] },
} satisfies Record<string, Record<string, unknown>>;
const inStatus = where('status', 'in', ['published', 'archived']);
const ids = async (q: ReturnType<typeof query>) => (await getDocs(q)).docs.map((d) => d.id).sort();

beforeAll(async () => {
  env = await startEnv();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/priya'), { teamIds: ['platform'] });
    await setDoc(doc(db, 'users/nina'), { displayName: 'No teams yet' });
    for (const name of BOTH) {
      for (const [id, access] of Object.entries(SEED)) {
        await setDoc(doc(db, name, id), { title: id, publishedAt: 1, ...access });
      }
    }
  });
});
afterAll(async () => {
  await env.cleanup();
});

describe.each(BOTH)('%s: one document', (name) => {
  it('opens a public one, and a team one for its team only', async () => {
    await assertSucceeds(getDoc(doc(as('nina'), name, 'open')));
    await assertSucceeds(getDoc(doc(as('priya'), name, 'plat')));
    await assertFails(getDoc(doc(as('nina'), name, 'plat')));
    await assertFails(getDoc(doc(as('priya'), name, 'qa')));
  });

  it('keeps staff-only and never-published ones to Educators and Admins', async () => {
    for (const id of ['staff', 'wip']) {
      await assertFails(getDoc(doc(as('priya'), name, id)));
      await assertSucceeds(getDoc(doc(as('asha', { educator: true }), name, id)));
      await assertSucceeds(getDoc(doc(as('ajay', { admin: true }), name, id)));
    }
  });

  it('opens nothing signed out or outside the domain', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), name, 'open')));
    const outsider = env
      .authenticatedContext('x', {
        email: 'x@example.com',
        email_verified: true,
        firebase: { sign_in_provider: 'google.com' },
      })
      .firestore();
    await assertFails(getDoc(doc(outsider, name, 'open')));
  });
});

describe.each(BOTH)('%s: a listing', (name) => {
  it('answers the public listing and the listing of the person’s own teams', async () => {
    expect(
      await ids(query(collection(as('nina'), name), inStatus, where('visibility', '==', 'public'))),
    ).toEqual(['open']);
    expect(
      await ids(
        query(
          collection(as('priya'), name),
          inStatus,
          where('visibility', '==', 'teams'),
          where('visibleTeamIds', 'array-contains-any', ['platform']),
        ),
      ),
    ).toEqual(['plat']);
  });

  it('refuses a listing that could return what the person may not open', async () => {
    await assertFails(getDocs(query(collection(as('priya'), name))));
    await assertFails(getDocs(query(collection(as('priya'), name), inStatus)));
    await assertFails(
      getDocs(query(collection(as('priya'), name), inStatus, where('visibility', '==', 'staff'))),
    );
    await assertFails(
      getDocs(
        query(
          collection(as('priya'), name),
          inStatus,
          where('visibility', '==', 'teams'),
          where('visibleTeamIds', 'array-contains-any', ['qa']),
        ),
      ),
    );
    await assertFails(
      getDocs(query(collection(as('priya'), name), where('visibility', '==', 'public'))),
    );
    await assertFails(
      getDocs(
        query(
          collection(env.unauthenticatedContext().firestore(), name),
          inStatus,
          where('visibility', '==', 'public'),
        ),
      ),
    );
  });

  it('lets an Educator or an Admin list everything, newest first', async () => {
    for (const claims of [{ educator: true }, { admin: true }]) {
      expect(await ids(query(collection(as('asha', claims), name)))).toEqual(
        Object.keys(SEED).sort(),
      );
      await assertSucceeds(
        getDocs(
          query(collection(as('asha', claims), name), inStatus, orderBy('publishedAt', 'desc')),
        ),
      );
    }
  });
});

describe('courseSummaries: writes', () => {
  it('are refused to everyone: only the function writes a summary', async () => {
    for (const claims of [{}, { educator: true }, { admin: true }]) {
      const db = as('asha', claims);
      await assertFails(setDoc(doc(db, 'courseSummaries/new'), SEED.open));
      await assertFails(setDoc(doc(db, 'courseSummaries/open'), { title: 'x' }, { merge: true }));
      await assertFails(deleteDoc(doc(db, 'courseSummaries/open')));
    }
  });
});
