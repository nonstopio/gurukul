import type { Page } from '@playwright/test';
import { itemIds, readDoc, uidOf } from '../support/emulators';
import { GIT_COURSE } from '../support/env';
import { expect, signedInAsLearner, test } from '../support/fixtures';

// Signing out deletes this browser's Firestore cache, so a write queue jammed by an old tab cannot
// come back with the same person. Unit tests fake Firestore; only a real browser shows the cache
// really goes and that the next sign-in opens a working instance.
const asha = { email: 'asha.rao@nonstopio.com', name: 'Asha Rao' };

/** Names of the IndexedDB databases the Firestore SDK keeps in this browser. */
async function firestoreCaches(page: Page): Promise<string[]> {
  return page.evaluate(async () =>
    (await indexedDB.databases()).flatMap((d) =>
      d.name?.startsWith('firestore/') ? [d.name] : [],
    ),
  );
}

async function resumePoint(): Promise<string | undefined> {
  const doc = await readDoc(`progress/${await uidOf(asha.email)}_${GIT_COURSE.id}`);
  return (doc?.lastItemId as { stringValue?: string } | undefined)?.stringValue;
}

async function openLesson(page: Page, id: string): Promise<void> {
  await page.goto(`/courses/${GIT_COURSE.id}/learn/${id}`);
  await expect(page.getByRole('progressbar', { name: 'Course progress' })).toBeVisible();
}

test('signing out deletes the local cache, and signing back in still saves progress', async ({
  page,
}) => {
  const [first, second] = (await itemIds(GIT_COURSE.id)).lessons as [string, string];
  await signedInAsLearner(page, asha);
  await openLesson(page, first);
  await expect.poll(resumePoint).toBe(first);
  expect(await firestoreCaches(page)).not.toEqual([]);

  await page.goto('/profile');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  await expect.poll(() => firestoreCaches(page)).toEqual([]);

  await signedInAsLearner(page, asha);
  await openLesson(page, second);
  await expect.poll(resumePoint).toBe(second);
});
