import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { course } from '../test/fixtures.js';

// The real `weeklyMediaCleanup` export against the Firestore and Storage emulators. Nothing in src/
// is mocked. The Storage emulator stamps every object with the moment it is written and cannot be
// told otherwise, so "older than 30 days" is reached by moving the clock (Date only) 31 days on.
process.env.GCLOUD_PROJECT = 'demo-gurukul';
process.env.FIREBASE_CONFIG = JSON.stringify({
  projectId: 'demo-gurukul',
  storageBucket: 'demo-gurukul.appspot.com',
});
const index = await import('../src/index.js');

const db = () => getFirestore();
const bucket = () => getStorage().bucket();
const path = (courseId: string, name: string) => `courses/${courseId}/media/${name}`;

const lesson = (...paths: string[]) => ({
  type: 'lesson',
  id: 'l1',
  title: 'L',
  minutes: 1,
  layout: 'stacked',
  completeWhen: 'manual',
  blocks: paths.map((p, i) => ({
    type: 'image',
    id: `i${i}`,
    url: 'https://example.com/a.png',
    alt: 'An image',
    upload: { path: p, bytes: 4, name: 'a.png', contentType: 'image/png' },
  })),
});
const withMedia = (id: string, ...paths: string[]) =>
  course(
    {},
    {
      id,
      publishedAt: Timestamp.fromMillis(1),
      chapters: [{ id: 'c1', title: 'C', items: [lesson(...paths)] }],
    },
  );

async function put(p: string): Promise<void> {
  await bucket().file(p).save(Buffer.from('data'), { contentType: 'image/png' });
}
const exists = async (p: string) => (await bucket().file(p).exists())[0];
const runCleanup = () => index.weeklyMediaCleanup.run({} as never);
const inThirtyOneDays = () => {
  vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 31 * 86_400_000 });
};

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.STORAGE_EMULATOR_HOST)
    throw new Error('Run through `npm run test:triggers`');
});
beforeEach(async () => {
  await db().recursiveDelete(db().collection('courses'));
  await bucket().deleteFiles({ prefix: 'courses/', force: true });
});
afterEach(() => vi.useRealTimers());

describe('weeklyMediaCleanup', () => {
  it('keeps every new file, referenced or not', async () => {
    await db().doc('courses/git').set(withMedia('git'));
    await put(path('git', 'orphan.png'));

    await runCleanup();

    expect(await exists(path('git', 'orphan.png'))).toBe(true);
  });

  it('deletes an old file nothing names and keeps the ones the draft, live course or a version names', async () => {
    const draftOnly = path('git', 'd.png');
    const liveOnly = path('git', 'l.png');
    const versionOnly = path('git', 'v.png');
    const orphan = path('git', 'o.png');
    const other = path('other', 'o.png');
    await db().doc('courses/git').set(withMedia('git', liveOnly));
    await db()
      .doc('courses/git/drafts/current')
      .set({ rev: 1, course: withMedia('git', draftOnly), answers: {} });
    await db()
      .doc('courses/git/versions/1')
      .set({ course: withMedia('git', versionOnly), answers: {} });
    // `other` exists but its documents are not read as a course here: its file must also be safe,
    // because a course with an unreadable copy is skipped entirely.
    await db().doc('courses/other').set({ title: 'broken' });
    const outside = 'courses/ghost/media/g.png';
    for (const p of [draftOnly, liveOnly, versionOnly, orphan, other, outside]) await put(p);
    await put('avatars/a.png');
    inThirtyOneDays();

    await runCleanup();

    expect(await exists(orphan)).toBe(false);
    for (const p of [draftOnly, liveOnly, versionOnly, other, outside, 'avatars/a.png'])
      expect(await exists(p)).toBe(true);
  });

  it('deletes nothing for a course whose draft does not parse', async () => {
    await db().doc('courses/git').set(withMedia('git'));
    await db()
      .doc('courses/git/drafts/current')
      .set({ rev: 1, course: { nope: true }, answers: {} });
    await put(path('git', 'orphan.png'));
    inThirtyOneDays();

    await runCleanup();

    expect(await exists(path('git', 'orphan.png'))).toBe(true);
  });
});
