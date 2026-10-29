import { expectNoSeriousViolations } from '../support/a11y';
import { grantRoles } from '../support/emulators';
import { GIT_COURSE } from '../support/env';
import { expect, signedInAsShishya, test } from '../support/fixtures';

const kavya = { email: 'kavya.menon@nonstopio.com', name: 'Kavya Menon' };

test.describe('Acharya in Vyasa Studio', () => {
  test('creates a course with a parva and a lesson, and it shows the right counts', async ({
    page,
  }) => {
    await signedInAsShishya(page, kavya);
    await grantRoles(kavya.email, ['acharya']);
    await page.goto('/studio');
    await expect(page.getByRole('heading', { level: 1, name: 'Courses' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: GIT_COURSE.title })).toBeVisible();
    await expectNoSeriousViolations(page);

    await page.getByRole('button', { name: 'New course', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'New course' });
    await dialog.getByLabel('Title').fill('Testing for Everyone');
    await expect(dialog.getByLabel('Address')).toHaveValue('testing-for-everyone');
    await dialog.getByRole('button', { name: 'Create course' }).click();

    await expect(page).toHaveURL(/\/studio\/courses\/testing-for-everyone$/);
    await page.getByRole('button', { name: 'Add parva' }).click();
    await page.getByLabel('Title of parva 1').fill('Why we test');
    await page.getByRole('button', { name: /^\+ Lesson/ }).click();
    // The lesson page reads the saved draft, so let the autosave (one second after the edit) land
    // before opening it.
    const saveState = page.getByRole('status').filter({ hasText: /saved|saving|unsaved/i });
    await expect(saveState).toHaveText(/unsaved changes/);
    await expect(saveState).toHaveText(/· saved/);
    await page.getByRole('link', { name: 'Untitled lesson' }).click();

    await page.getByLabel('Lesson title').fill('The cost of a bug');
    await page.getByRole('button', { name: 'Text', exact: true }).click();
    await page
      .getByLabel('Text (Markdown)')
      .fill('A bug found in review costs minutes. The same bug found in production costs days.');
    await expect(saveState).toHaveText(/unsaved changes/);
    await expect(saveState).toHaveText(/· saved/);

    await page
      .getByRole('navigation', { name: 'Breadcrumb' })
      .getByRole('link', { name: 'Studio' })
      .click();
    const card = page.getByRole('article').filter({ hasText: 'Testing for Everyone' });
    await expect(card).toContainText('1 parvas · 1 lessons · 0 Parikshas');
    await expect(card).toContainText('Draft');
  });

  test('publishes a course and it appears in the catalogue', async ({ page }) => {
    await signedInAsShishya(page, kavya);
    await grantRoles(kavya.email, ['acharya']);
    await page.goto('/studio');
    await page.getByRole('button', { name: 'New course', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'New course' });
    await dialog.getByLabel('Title').fill('Reading Code Reviews');
    await dialog.getByRole('button', { name: 'Create course' }).click();
    await expect(page).toHaveURL(/\/studio\/courses\/reading-code-reviews$/);

    await page.getByLabel('Summary').fill('How to read a review comment and answer it well.');
    await page.getByRole('button', { name: 'Add parva' }).click();
    await page.getByLabel('Title of parva 1').fill('Reading comments');
    await page.getByRole('button', { name: /^\+ Lesson/ }).click();
    const saveState = page.getByRole('status').filter({ hasText: /saved|saving|unsaved/i });
    await expect(saveState).toHaveText(/unsaved changes/);
    await expect(saveState).toHaveText(/· saved/);
    await page.getByRole('link', { name: 'Untitled lesson' }).click();
    await page.getByLabel('Lesson title').fill('A comment is a question');
    await page.getByRole('button', { name: 'Text', exact: true }).click();
    await page
      .getByLabel('Text (Markdown)')
      .fill('Treat each comment as a question, not a verdict.');
    await expect(saveState).toHaveText(/unsaved changes/);
    await expect(saveState).toHaveText(/· saved/);

    // Not published yet, so learners cannot see it.
    await page.goto('/courses');
    await expect(page.getByRole('heading', { level: 1, name: 'Course catalogue' })).toBeVisible();
    await expect(page.getByRole('link', { name: GIT_COURSE.title })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Reading Code Reviews' })).toHaveCount(0);

    await page.goto('/studio/courses/reading-code-reviews');
    await page.getByRole('button', { name: 'Publish v1' }).click();
    const publish = page.getByRole('dialog', { name: 'Publish v1' });
    await expect(publish.getByText('This is the first publication')).toBeVisible();
    await publish.getByRole('button', { name: 'Publish v1' }).click();
    await expect(page.getByText('Published v1. Learners see it now.')).toBeVisible();

    await page.goto('/courses');
    await expect(page.getByRole('link', { name: 'Reading Code Reviews' })).toBeVisible();
  });
});
