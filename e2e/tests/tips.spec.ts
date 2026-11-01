import type { Page } from '@playwright/test';
import { expectNoSeriousViolations } from '../support/a11y';
import { expect, signedInAsLearner, test } from '../support/fixtures';

const asha = { email: 'asha.rao@nonstopio.com', name: 'Asha Rao' };
const bubble = (page: Page) => page.locator('.g-tip');
const dot = (page: Page, name: string) => page.locator(`.driver-hint[aria-label="${name}"]`);

test.describe('Feature tips', () => {
  test('open the first tip once, keep the dot on Escape, and go for good on "Got it"', async ({
    page,
  }) => {
    await signedInAsLearner(page, asha);
    await expect(bubble(page)).toBeVisible();
    await expect(bubble(page)).toContainText(
      'Tip: Find a course, a lesson or a page from anywhere',
    );
    await expect(dot(page, 'Search')).toBeVisible();
    await expect(dot(page, 'Light or dark')).toBeVisible();
    await expectNoSeriousViolations(page);

    await page.keyboard.press('Escape');
    await expect(bubble(page)).toBeHidden();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: /^Namaste/ })).toBeVisible();
    await page.waitForTimeout(1200);
    await expect(bubble(page)).toBeHidden();

    await dot(page, 'Search').click();
    await expect(bubble(page)).toBeVisible();
    await page.getByRole('button', { name: 'Got it' }).click();
    await expect(bubble(page)).toBeHidden();
    await page.reload();
    await page.waitForTimeout(1200);
    await expect(dot(page, 'Search')).toHaveCount(0);
    await expect(dot(page, 'Light or dark')).toBeVisible();
  });

  test('a dot opens from the keyboard and Escape gives focus back to it', async ({ page }) => {
    await signedInAsLearner(page, asha);
    await expect(bubble(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await dot(page, 'Light or dark').focus();
    await page.keyboard.press('Enter');
    await expect(bubble(page)).toContainText('light or dark look');
    await page.keyboard.press('Escape');
    await expect(bubble(page)).toBeHidden();
    await expect(dot(page, 'Light or dark')).toBeFocused();
  });

  test('using a feature dismisses its tip, and a dialog hides every tip', async ({ page }) => {
    await signedInAsLearner(page, asha);
    await expect(bubble(page)).toBeVisible();
    await page
      .getByRole('button', { name: /^Search/ })
      .and(page.locator('.search-trigger'))
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('.driver-hint')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(dot(page, 'Search')).toHaveCount(0);
    await expect(dot(page, 'Light or dark')).toBeVisible();
  });

  test('stay out of the way of the phone sidebar drawer', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await signedInAsLearner(page, asha);
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.waitForTimeout(1200);
    await expect(page.locator('.driver-hint')).toHaveCount(0);
    await expect(bubble(page)).toBeHidden();
  });

  test('turn off and on from the Profile, per person', async ({ page }) => {
    await signedInAsLearner(page, asha);
    await page.goto('/profile');
    const toggle = page.getByRole('switch', { name: 'Feature tips' });
    await page.getByText('Feature tips', { exact: true }).click();
    await expect(toggle).not.toBeChecked();
    await page.goto('/');
    await page.waitForTimeout(1200);
    await expect(bubble(page)).toBeHidden();
    await expect(page.locator('.driver-hint')).toHaveCount(0);

    await page.goto('/profile');
    await page.getByText('Feature tips', { exact: true }).click();
    await expect(toggle).toBeChecked();
    await page.goto('/');
    await expect(bubble(page)).toBeVisible();
  });
});
