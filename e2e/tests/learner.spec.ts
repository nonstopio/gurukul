import { gitAnswers, gitCourse } from '../../firebase/seed/src/git-course';
import { seedProgress } from '../support/emulators';
import { APP_URL, GIT_COURSE } from '../support/env';
import { expectNoSeriousViolations } from '../support/a11y';
import { expect, signInWithGoogle, signedInAsShishya, test } from '../support/fixtures';

const asha = { email: 'asha.rao@nonstopio.com', name: 'Asha Rao' };

const FINAL = 'pariksha-final';

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

    // The first lesson's video is not recorded yet, so it says so and does not hold the lesson back.
    await expect(page.getByText('Video coming soon.')).toBeVisible();
    const markComplete = page.getByRole('button', { name: 'Mark complete' });
    await expect(markComplete).toBeEnabled();
    await markComplete.click();

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

  test('passes the final Pariksha, gets a certificate and anyone can verify it', async ({
    page,
    browser,
  }) => {
    await signedInAsShishya(page, asha);
    // Everything before the final Pariksha is done; the journey under test starts there.
    const items = gitCourse.parvas.flatMap((p) => p.items);
    await seedProgress(asha.email, GIT_COURSE.id, {
      lessons: items.filter((i) => i.type === 'lesson').map((i) => i.id),
      passedParikshas: items
        .filter((i) => i.type === 'pariksha' && i.id !== FINAL)
        .map((i) => i.id),
    });

    await page.goto(`/courses/${GIT_COURSE.id}/pariksha/${FINAL}`);
    const keys = gitAnswers[FINAL] ?? {};
    const total = Object.keys(keys).length;
    for (let n = 1; n <= total; n += 1) {
      await expect(page.getByText(`Question ${n} of ${total}`)).toBeVisible();
      // The radio's name is the question id, so the answer key tells us what to pick.
      const id = await page.locator('input[name]').first().getAttribute('name');
      for (const option of keys[id as string] ?? []) {
        await page
          .locator('label.g-quiz-option')
          .filter({ has: page.locator(`input[name="${id}"][value="${option}"]`) })
          .click();
      }
      await page
        .getByRole('button', { name: n === total ? 'Finish Pariksha' : 'Next question' })
        .click();
    }

    await expect(
      page.getByRole('heading', { level: 1, name: /Final Pariksha: .* cleared\./ }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Finish course' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: `${GIT_COURSE.title}, done.` }),
    ).toBeVisible();
    await expectNoSeriousViolations(page);

    // The certificate is issued by a function a moment after the last pass.
    await page.getByRole('link', { name: 'View and download certificate' }).click();
    await expect(page).toHaveURL(/\/certificates\/NSG-[\w-]+$/);
    const credential = page.url().split('/').pop() as string;
    await expect(page.getByText(credential).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Add to LinkedIn' })).toBeVisible();
    await expectNoSeriousViolations(page);

    // `/verify` is public: a signed-out visitor sees it is genuine, and an unknown id is not found.
    const visitor = await browser.newPage({ baseURL: APP_URL });
    await visitor.goto(`/verify/${credential}`);
    await expect(visitor.getByRole('heading', { level: 1, name: 'Valid' })).toBeVisible();
    await expect(visitor.getByText(`to ${asha.name} for ${GIT_COURSE.title}`)).toBeVisible();
    await expectNoSeriousViolations(visitor);
    await visitor.goto('/verify/NSG-0000-000000');
    await expect(
      visitor.getByRole('heading', { level: 1, name: 'Certificate not found' }),
    ).toBeVisible();
    await visitor.close();
  });
});
