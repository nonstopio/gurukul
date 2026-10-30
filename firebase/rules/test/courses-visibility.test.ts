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
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { nonstop, startEnv } from './helpers';

let env: RulesTestEnvironment;
const as = (uid: string, claims: Record<string, unknown> = {}) => nonstop(env, uid, claims);

const course = (over: Record<string, unknown> = {}) => ({
  status: 'published',
  educatorIds: ['asha'],
  title: 'C',
  ...over,
});
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
    await setDoc(doc(db, 'users/rohan'), { teamIds: ['qa', 'platform'] });
    await setDoc(doc(db, 'users/nina'), { displayName: 'No teams yet' });
    await setDoc(doc(db, 'courses/open'), course({ visibility: 'public', visibleTeamIds: [] }));
    await setDoc(
      doc(db, 'courses/plat'),
      course({ visibility: 'teams', visibleTeamIds: ['platform', 'ops'] }),
    );
    await setDoc(doc(db, 'courses/qa'), course({ visibility: 'teams', visibleTeamIds: ['qa'] }));
    await setDoc(doc(db, 'courses/staff'), course({ visibility: 'staff', visibleTeamIds: [] }));
    await setDoc(doc(db, 'courses/legacy'), course());
    await setDoc(
      doc(db, 'courses/old-qa'),
      course({ status: 'archived', visibility: 'teams', visibleTeamIds: ['qa'] }),
    );
    await setDoc(doc(db, 'courses/wip'), course({ status: 'draft', visibility: 'public' }));
  });
});
afterAll(async () => {
  await env.cleanup();
});

describe('course visibility: reading one course', () => {
  it('opens a public course, and one with no visibility, for any signed-in person', async () => {
    await assertSucceeds(getDoc(doc(as('nina'), 'courses/open')));
    await assertSucceeds(getDoc(doc(as('nina'), 'courses/legacy')));
  });
  it('opens a teams course only for a member of a listed team', async () => {
    await assertSucceeds(getDoc(doc(as('priya'), 'courses/plat')));
    await assertSucceeds(getDoc(doc(as('rohan'), 'courses/qa')));
    await assertFails(getDoc(doc(as('priya'), 'courses/qa')));
    await assertFails(getDoc(doc(as('nina'), 'courses/plat')));
    await assertFails(getDoc(doc(as('nobody'), 'courses/plat')));
  });
  it('keeps a retired teams course for its team too', async () => {
    await assertSucceeds(getDoc(doc(as('rohan'), 'courses/old-qa')));
    await assertFails(getDoc(doc(as('priya'), 'courses/old-qa')));
  });
  it('opens a staff course for Educators and Admins and for nobody else', async () => {
    await assertSucceeds(getDoc(doc(as('asha', { educator: true }), 'courses/staff')));
    await assertSucceeds(getDoc(doc(as('ajay', { admin: true }), 'courses/staff')));
    await assertFails(getDoc(doc(as('priya'), 'courses/staff')));
    await assertFails(getDoc(doc(as('rohan'), 'courses/staff')));
  });
  it('lets an Educator or Admin open a teams course whatever their team', async () => {
    await assertSucceeds(getDoc(doc(as('nina', { educator: true }), 'courses/qa')));
    await assertSucceeds(getDoc(doc(as('nina', { admin: true }), 'courses/qa')));
  });
  it('still hides a draft from a learner, whatever its visibility', async () => {
    await assertFails(getDoc(doc(as('priya'), 'courses/wip')));
    await assertSucceeds(getDoc(doc(as('asha', { educator: true }), 'courses/wip')));
  });
  it('does not let a learner change their own team ids to get in', async () => {
    const db = as('nina');
    await assertFails(setDoc(doc(db, 'users/nina'), { teamIds: ['qa'] }, { merge: true }));
    await assertFails(getDoc(doc(db, 'courses/qa')));
  });
});

describe('course visibility: listing the catalogue', () => {
  it('lists the public courses', async () => {
    expect(
      await ids(
        query(collection(as('nina'), 'courses'), inStatus, where('visibility', '==', 'public')),
      ),
    ).toEqual(['open']);
  });
  it('lists the teams courses of the teams the person is on', async () => {
    const teams = (uid: string, mine: string[]) =>
      ids(
        query(
          collection(as(uid), 'courses'),
          inStatus,
          where('visibility', '==', 'teams'),
          where('visibleTeamIds', 'array-contains-any', mine),
        ),
      );
    expect(await teams('priya', ['platform'])).toEqual(['plat']);
    expect(await teams('rohan', ['qa', 'platform'])).toEqual(['old-qa', 'plat', 'qa']);
  });
  it('refuses to list teams courses of a team the person is not on', async () => {
    const teams = (uid: string, mine: string[]) =>
      getDocs(
        query(
          collection(as(uid), 'courses'),
          inStatus,
          where('visibility', '==', 'teams'),
          where('visibleTeamIds', 'array-contains-any', mine),
        ),
      );
    await assertFails(teams('priya', ['qa']));
    await assertFails(teams('priya', ['platform', 'qa']));
    await assertFails(teams('nina', ['platform']));
  });
  it('refuses a listing that does not say which visibility it wants', async () => {
    await assertFails(getDocs(query(collection(as('priya'), 'courses'), inStatus)));
    await assertFails(
      getDocs(
        query(collection(as('priya'), 'courses'), inStatus, where('visibility', '==', 'staff')),
      ),
    );
    await assertFails(
      getDocs(
        query(
          collection(as('priya'), 'courses'),
          inStatus,
          where('visibleTeamIds', 'array-contains', 'platform'),
        ),
      ),
    );
  });
  it('lets an Educator or Admin list everything, drafts and staff courses included', async () => {
    for (const claims of [{ educator: true }, { admin: true }]) {
      const all = await ids(query(collection(as('asha', claims), 'courses')));
      expect(all).toEqual(['legacy', 'old-qa', 'open', 'plat', 'qa', 'staff', 'wip']);
    }
  });
  it('lists nothing for a signed-out visitor or another domain', async () => {
    const q = (db: ReturnType<RulesTestEnvironment['unauthenticatedContext']>['firestore']) =>
      getDocs(query(collection(db(), 'courses'), inStatus, where('visibility', '==', 'public')));
    await assertFails(q(() => env.unauthenticatedContext().firestore()));
    await assertFails(q(() => as('priya', { email: 'p@gmail.com' })));
  });
});

describe('course visibility: starting a course', () => {
  const newProgress = (uid: string, courseId: string) => ({
    uid,
    courseId,
    courseVersion: 1,
    startedAt: serverTimestamp(),
    lastItemId: null,
    lastActiveAt: serverTimestamp(),
    completedItemIds: [],
    quiz: {},
    percent: 0,
    completedAt: null,
    certificateId: null,
  });
  it('lets a member start a teams course and refuses a person outside it', async () => {
    await assertSucceeds(
      setDoc(doc(as('priya'), 'progress/priya_plat'), newProgress('priya', 'plat')),
    );
    await assertFails(setDoc(doc(as('priya'), 'progress/priya_qa'), newProgress('priya', 'qa')));
    await assertFails(
      setDoc(doc(as('priya'), 'progress/priya_staff'), newProgress('priya', 'staff')),
    );
  });
  it('lets a person start a public course and one with no visibility', async () => {
    await assertSucceeds(
      setDoc(doc(as('nina'), 'progress/nina_open'), newProgress('nina', 'open')),
    );
    await assertSucceeds(
      setDoc(doc(as('nina'), 'progress/nina_legacy'), newProgress('nina', 'legacy')),
    );
  });
});
