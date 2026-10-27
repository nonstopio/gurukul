import { GIT_COURSE } from '../support/env';
import { expectNoSeriousViolations } from '../support/a11y';
import { expect, signInWithGoogle, signedInAsShishya, test } from '../support/fixtures';

const asha = { email: 'asha.rao@nonstopio.com', name: 'Asha Rao' };

test.describe('Learner', () => {
  test('signs in, lands on Home and opens the first lesson of the Git course', async ({ page }) => {
    await signedInAsShishya(page, asha);
    await expect(page.getByRole('heading', { level: 1, name: 'Namaste, Asha' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Nothing assigned yet' })).toBeVisible();
    await expectNoSeriousViolations(page);

    await page.getByRole('link', { name: 'Browse the catalogue' }).click();
    await page.getByRole('link', { name: GIT_COURSE.title }).click();
    await expect(page.getByRole('heading', { level: 1, name: GIT_COURSE.title })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Outline' })).toBeVisible();
    await expectNoSeriousViolations(page);

    await page.getByRole('link', { name: 'Start course' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: GIT_COURSE.firstLesson }),
    ).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Course progress' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
  });

  test('marks the first lesson complete and sees progress move', async ({ page }) => {
    await signedInAsShishya(page, asha);
    await page.goto(`/courses/${GIT_COURSE.id}/learn/what-git-solves`);
    const progress = page.getByRole('progressbar', { name: 'Course progress' });
    await expect(progress).toHaveAttribute('aria-valuenow', '0');

    // The first lesson is a video: it completes once the learner says they watched it.
    // (The switch itself is visually hidden, so the click goes to its label.)
    await page.getByText('I have watched the video').click();
    await expect(page.getByLabel('I have watched the video')).toBeChecked();
    await page.getByRole('button', { name: 'Mark complete' }).click();

    await expect(page).toHaveURL(/\/learn\/install-and-configure-git$/);
    await expect(progress).not.toHaveAttribute('aria-valuenow', '0');
  });

  test('refuses a personal Gmail account by name and offers another account', async ({ page }) => {
    await page.goto('/');
    await signInWithGoogle(page, { email: 'someone@gmail.com', name: 'Some One' });
    const alert = page.getByRole('alert').filter({ hasText: 'Gurukul is for' });
    await expect(alert).toHaveText(
      'You signed in as someone@gmail.com. Gurukul is for NonStop io accounts: choose your @nonstopio.com Google account.',
    );
    await expect(alert).toBeFocused();
    await expect(page.getByRole('button', { name: 'Try another account' })).toBeVisible();
  });
});
