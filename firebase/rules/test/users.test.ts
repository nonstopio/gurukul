import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

/** A signed-in NonStop account with optional role claims. */
function nonstop(uid: string, claims: Record<string, unknown> = {}) {
  return env
    .authenticatedContext(uid, {
      email: `${uid}@nonstopio.com`,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
      ...claims,
    })
    .firestore();
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-gurukul',
    firestore: {
      rules: readFileSync(resolve(import.meta.dirname, '../../firestore.rules'), 'utf8'),
    },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users/priya'), {
      displayName: 'Priya',
      team: null,
      roles: ['shishya'],
    });
  });
});

afterAll(async () => {
  await env.cleanup();
});

describe('users/{uid}', () => {
  it('lets a person read their own profile', async () => {
    const db = nonstop('priya');
    await assertSucceeds(getDoc(doc(db, 'users/priya')));
  });

  it("does not let a shishya read someone else's profile", async () => {
    const db = nonstop('rohan');
    await assertFails(getDoc(doc(db, 'users/priya')));
  });

  it('lets a kulapati read any profile', async () => {
    const db = nonstop('ajay', { kulapati: true });
    await assertSucceeds(getDoc(doc(db, 'users/priya')));
  });

  it('denies a personal Gmail account, even for its own uid', async () => {
    const db = nonstop('priya', { email: 'priya@gmail.com' });
    await assertFails(getDoc(doc(db, 'users/priya')));
  });

  it('denies a kulapati claim on a non-NonStop or unverified account', async () => {
    await assertFails(
      getDoc(doc(nonstop('ajay', { kulapati: true, email: 'ajay@gmail.com' }), 'users/priya')),
    );
    await assertFails(
      getDoc(doc(nonstop('ajay', { kulapati: true, email_verified: false }), 'users/priya')),
    );
  });

  it('accepts a NonStop address in any letter case', async () => {
    const db = nonstop('meera', { email: 'Meera.I@NonStopIO.com' });
    await assertSucceeds(getDoc(doc(db, 'users/meera')));
  });

  it('denies a NonStop address that did not sign in with Google', async () => {
    const db = nonstop('rohan', { firebase: { sign_in_provider: 'password' } });
    await assertFails(getDoc(doc(db, 'users/rohan')));
  });

  it('denies an unverified NonStop email', async () => {
    const db = nonstop('priya', { email_verified: false });
    await assertFails(getDoc(doc(db, 'users/priya')));
  });

  it('denies a look-alike domain', async () => {
    const db = nonstop('priya', { email: 'priya@nonstopio.com.evil.io' });
    await assertFails(getDoc(doc(db, 'users/priya')));
  });

  it('denies signed-out reads', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'users/priya')));
  });

  it('denies creating or deleting a profile from the client', async () => {
    const db = nonstop('rohan');
    await assertFails(setDoc(doc(db, 'users/rohan'), { displayName: 'Rohan', team: null }));
    await assertFails(deleteDoc(doc(nonstop('priya'), 'users/priya')));
  });

  it('lets a person change their display name and team', async () => {
    const db = nonstop('priya');
    await assertSucceeds(
      updateDoc(doc(db, 'users/priya'), {
        displayName: 'Priya N',
        nameLower: 'priya n',
        team: 'QA',
      }),
    );
    await assertSucceeds(updateDoc(doc(db, 'users/priya'), { team: null }));
  });

  it("denies changing roles, granted courses or anyone else's profile", async () => {
    const db = nonstop('priya');
    await assertFails(updateDoc(doc(db, 'users/priya'), { roles: ['kulapati'] }));
    await assertFails(
      updateDoc(doc(db, 'users/priya'), {
        displayName: 'P',
        nameLower: 'p',
        grantedCourseIds: ['git'],
      }),
    );
    await assertFails(
      updateDoc(doc(nonstop('rohan'), 'users/priya'), {
        displayName: 'Hacked',
        nameLower: 'hacked',
      }),
    );
    await assertFails(
      updateDoc(doc(nonstop('ajay', { kulapati: true }), 'users/priya'), {
        displayName: 'X',
        nameLower: 'x',
      }),
    );
  });

  it('lets a person fill in the lower-cased name that people search by', async () => {
    await assertSucceeds(updateDoc(doc(nonstop('priya'), 'users/priya'), { nameLower: 'priya' }));
  });

  it('keeps the lower-cased name in step with the display name', async () => {
    const db = nonstop('priya');
    await assertFails(updateDoc(doc(db, 'users/priya'), { displayName: 'Priya N' }));
    await assertFails(
      updateDoc(doc(db, 'users/priya'), { displayName: 'Priya N', nameLower: 'priya' }),
    );
    await assertFails(updateDoc(doc(db, 'users/priya'), { nameLower: 'someone else' }));
    await assertFails(updateDoc(doc(nonstop('rohan'), 'users/priya'), { nameLower: 'priya' }));
  });

  it('denies a badly shaped display name or team', async () => {
    const db = nonstop('priya');
    await assertFails(updateDoc(doc(db, 'users/priya'), { displayName: 42 }));
    await assertFails(
      updateDoc(doc(db, 'users/priya'), {
        displayName: 'x'.repeat(121),
        nameLower: 'x'.repeat(121),
      }),
    );
    await assertFails(updateDoc(doc(db, 'users/priya'), { team: 'x'.repeat(81) }));
    await assertFails(updateDoc(doc(db, 'users/priya'), { team: 7 }));
  });
});

describe('everything else', () => {
  it('is closed by default', async () => {
    const db = nonstop('ajay', { kulapati: true });
    await assertFails(getDoc(doc(db, 'unknown/thing')));
    await assertFails(setDoc(doc(db, 'unknown/thing'), { title: 'Git' }));
  });
});
