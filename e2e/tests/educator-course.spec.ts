import { expectNoSeriousViolations } from '../support/a11y';
import { APP_URL } from '../support/env';
import { grantRoles, itemIds, seedProgress } from '../support/emulators';
import { expect, signedInAsLearner, test } from '../support/fixtures';

const EDUCATOR_COURSE = { id: 'educator-onboarding', title: 'Becoming a Gurukul Educator' };
const meera = { email: 'meera.iyer@nonstopio.com', name: 'Meera Iyer' };
const ravi = { email: 'ravi.candidate@nonstopio.com', name: 'Ravi Candidate' };

test.describe('The Educator course', () => {
  test('an Admin assigns it before first sign-in; the learner opens it and, finishing it, becomes an Educator', async ({
    page,
    browser,
  }) => {
    await signedInAsLearner(page, meera);
    await grantRoles(meera.email, ['admin']);
    await page.goto('/admin/assign');
    await expect(page.getByRole('heading', { level: 1, name: 'Assign courses' })).toBeVisible();
    await page.getByRole('checkbox', { name: new RegExp(EDUCATOR_COURSE.title) }).check();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'People' }).click();
    await page.getByRole('combobox', { name: 'Add people' }).fill(`${ravi.email} `);
    await expect(page.getByText('1 person will be assigned.')).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('main').getByRole('button', { name: 'Assign to 1 person' }).click();
    await expect(page.getByRole('heading', { name: 'Assigned to 1 person' })).toBeVisible();

    // Ravi's first sign-in claims the assignment and the team the assignment put him on, which is
    // what opens the course for him.
    const learner = await browser.newPage({ baseURL: APP_URL });
    await signedInAsLearner(learner, ravi);
    const tile = learner.getByRole('link', { name: new RegExp(EDUCATOR_COURSE.title) }).first();
    await expect(async () => {
      await learner.reload();
      await expect(tile).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await tile.click();
    await expect(
      learner.getByRole('heading', { level: 1, name: EDUCATOR_COURSE.title }),
    ).toBeVisible();

    const { lessons, quizzes } = await itemIds(EDUCATOR_COURSE.id);
    await seedProgress(ravi.email, EDUCATOR_COURSE.id, { lessons, passedQuizzes: quizzes });
    await learner.goto(`/courses/${EDUCATOR_COURSE.id}/complete`);
    await expect(learner.getByText('You are now an Educator.')).toBeVisible({ timeout: 20_000 });
    await expectNoSeriousViolations(learner);
    await learner.getByRole('link', { name: 'Open Studio' }).click();
    await expect(learner).toHaveURL(/\/studio$/);
    await learner.close();
  });
});
