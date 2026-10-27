import { expect, test as base } from '@playwright/test';
import type { Page } from '@playwright/test';
import { resetEmulators } from './emulators';

/**
 * Web fonts, the stylesheets of the Auth emulator's sign-in widget and YouTube (the player API and
 * its embeds) come from the internet; they are blocked so a slow network cannot slow or change a
 * run. With YouTube blocked, a video lesson falls back to "I have watched the video". Firebase's
 * own script (apis.google.com) is left alone: the SDK fails the sign-in if it cannot start.
 */
const EXTERNAL =
  /^https:\/\/(unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|www\.youtube\.com|www\.youtube-nocookie\.com)\//;

export const test = base.extend<{ clean: boolean }>({
  context: async ({ context }, use) => {
    await context.route(EXTERNAL, (route) => route.abort());
    await use(context);
  },
  // Each test starts from no accounts, no documents but the seeded course.
  clean: [
    async ({ baseURL }, use) => {
      // (`baseURL` is only named because a fixture must destructure something.)
      expect(baseURL).toBeTruthy();
      await resetEmulators();
      await use(true);
    },
    { auto: true },
  ],
});

export { expect };

export interface Person {
  email: string;
  name: string;
}

/**
 * Signs in through the Auth emulator's fake Google popup: "Add new account" (or the account if it
 * already exists), email and display name, "Sign in with Google.com". The popup closes itself.
 * It does not wait for the app: callers wait for what they expect to see next.
 */
export async function signInWithGoogle(page: Page, person: Person): Promise<void> {
  const popupOpened = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Sign in with Google' }).click();
  const popup = await popupOpened;
  const existing = popup.getByRole('listitem').filter({ hasText: person.email });
  const add = popup.getByRole('button', { name: 'Add new account' });
  await expect(add.or(existing)).toBeVisible();
  if (await existing.isVisible()) {
    await existing.click();
  } else {
    await add.click();
    await popup.locator('#email-input').fill(person.email);
    await popup.locator('#display-name-input').fill(person.name);
    await popup.getByRole('button', { name: 'Sign in with Google.com' }).click();
  }
  await popup.waitForEvent('close');
}

/** Opens the app signed out, signs in, and waits for Home. */
export async function signedInAsShishya(page: Page, person: Person): Promise<void> {
  await page.goto('/');
  await signInWithGoogle(page, person);
  await expect(page.getByRole('heading', { level: 1, name: /^Namaste/ })).toBeVisible();
}
