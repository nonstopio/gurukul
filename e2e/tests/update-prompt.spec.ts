import type { Page } from '@playwright/test';
import { expectNoSeriousViolations } from '../support/a11y';
import { FIRESTORE_URL } from '../support/env';
import { expect, signedInAsLearner, test } from '../support/fixtures';

// A tab left open runs the code it loaded. These serve a different /version.json to an open tab
// and check what it does: a newer build is offered and never forced; a required one stops the tab.
const asha = { email: 'asha.rao@nonstopio.com', name: 'Asha Rao' };
const READY = 'A new version of Gurukul is ready';

/** From now on, /version.json names another build. */
async function serveVersion(page: Page, body: { id: string; required?: number }) {
  await page.route('**/version.json', (route) => route.fulfill({ json: body }));
}

/** Runs the version check now, as when the tab becomes visible, and waits for its answer. */
async function checkNow(page: Page) {
  const answered = page.waitForResponse('**/version.json');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await answered;
}

test.describe('Update prompt', () => {
  test('a newer build is offered, never forced, and Later puts it away until the next one', async ({
    page,
  }) => {
    await signedInAsLearner(page, asha);
    await serveVersion(page, { id: 'e2e-next', required: 0 });
    await checkNow(page);
    await expect(page.getByText(READY)).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByRole('button', { name: 'Later' }).click();
    await expect(page.getByText(READY)).toBeHidden();
    // The same build again: still put away.
    await checkNow(page);
    await expect(page.getByText(READY)).toBeHidden();
    // A newer one is offered again.
    await page.unroute('**/version.json');
    await serveVersion(page, { id: 'e2e-later', required: 0 });
    await checkNow(page);
    await expect(page.getByText(READY)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: /^Namaste/ })).toBeVisible();
  });

  test('a required update blocks the tab and stops every Firestore request', async ({ page }) => {
    await signedInAsLearner(page, asha);
    let requests = 0;
    let counting = false;
    page.on('request', (r) => {
      if (counting && r.url().startsWith(FIRESTORE_URL)) requests += 1;
    });
    await serveVersion(page, { id: 'e2e-required', required: 1 });
    await checkNow(page);
    const dialog = page.getByRole('dialog', { name: 'Gurukul has been updated' });
    await expect(dialog).toBeVisible();
    counting = true;

    // It cannot be put away.
    await expect(dialog.getByRole('button')).toHaveText(['Update']);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Tab');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Update' })).toBeFocused();
    await expectNoSeriousViolations(page);

    // The page behind tries to read: open the catalogue under the dialog, as a link would.
    await page.evaluate(() => {
      history.pushState({}, '', '/courses');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(dialog).toBeInViewport();
    // It fits a phone: no part of it off screen.
    const box = await dialog.boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= 390).toBe(true);
    await page.waitForTimeout(3_000);
    expect(requests).toBe(0);

    // Update reloads into the live build.
    await page.unroute('**/version.json');
    await dialog.getByRole('button', { name: 'Update' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
