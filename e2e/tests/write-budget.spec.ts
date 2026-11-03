import type { Page } from '@playwright/test';
import { countChanges, itemIds, readDoc, setCourseField, uidOf } from '../support/emulators';
import { FIRESTORE_URL, GIT_COURSE } from '../support/env';
import { expect, signedInAsLearner, test } from '../support/fixtures';

// A page left open must not write or retry in a loop: unit tests render once and stop, so only a
// real browser, a real emulator and a clock catch it. Each loop below once reached production.
const asha = { email: 'asha.rao@nonstopio.com', name: 'Asha Rao' };
const IDLE_MS = 8_000;

const lesson = (id: string) => `/courses/${GIT_COURSE.id}/learn/${id}`;

/** The progress document's path and a reader for its resume point. */
async function progressOf(email: string) {
  const path = `progress/${await uidOf(email)}_${GIT_COURSE.id}`;
  const lastItemId = async () =>
    ((await readDoc(path))?.lastItemId as { stringValue?: string } | undefined)?.stringValue;
  return { path, lastItemId };
}

async function openLesson(page: Page, id: string) {
  await page.goto(lesson(id));
  await expect(page.getByRole('progressbar', { name: 'Course progress' })).toBeVisible();
}

test.describe('Write budget', () => {
  test('an idle lesson stays quiet', async ({ page }) => {
    const [first] = (await itemIds(GIT_COURSE.id)).lessons as [string];
    await signedInAsLearner(page, asha);
    await openLesson(page, first);
    const progress = await progressOf(asha.email);
    // Settled: the course started and the resume point is this lesson.
    await expect.poll(progress.lastItemId).toBe(first);

    expect(await countChanges(progress.path, IDLE_MS)).toBeLessThanOrEqual(1);
  });

  test('two tabs on different lessons stay quiet', async ({ page, context }) => {
    // Each tab once answered the other's resume point with its own, every second or two, forever.
    const [first, second] = (await itemIds(GIT_COURSE.id)).lessons as [string, string];
    await signedInAsLearner(page, asha);
    await openLesson(page, first);
    const progress = await progressOf(asha.email);
    await expect.poll(progress.lastItemId).toBe(first);

    const other = await context.newPage();
    await openLesson(other, second);
    await expect.poll(progress.lastItemId).toBe(second);

    expect(await countChanges(progress.path, IDLE_MS)).toBeLessThanOrEqual(2);
  });

  test('a lesson the learner cannot start does not retry', async ({ page }) => {
    // The rules refuse to start a retired course; the refused write once rolled progress back to
    // "not started" and the page tried again, round after round, for as long as it stayed open.
    const [first] = (await itemIds(GIT_COURSE.id)).lessons as [string];
    await setCourseField(GIT_COURSE.id, 'status', 'archived');
    await signedInAsLearner(page, asha);

    await openLesson(page, first);
    // Counted in the browser, not the console: the old loop failed quietly. Idle, the page makes
    // no Firestore requests at all; the loop made about a hundred a second.
    let requests = 0;
    page.on('request', (r) => {
      if (r.url().startsWith(FIRESTORE_URL)) requests += 1;
    });
    await page.waitForTimeout(IDLE_MS);

    expect(requests).toBeLessThanOrEqual(10);
    expect(await readDoc((await progressOf(asha.email)).path)).toBeUndefined();
  });
});
