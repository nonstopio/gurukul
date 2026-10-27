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
    const saveState = page.getByRole('status').filter({ hasText: /Saved|Saving|Unsaved/ });
    await expect(saveState).toHaveText(/Unsaved changes/);
    await expect(saveState).toHaveText(/Saved/);
    await page.getByRole('link', { name: 'Untitled lesson' }).click();

    await page.getByLabel('Lesson title').fill('The cost of a bug');
    await page.getByRole('button', { name: 'Text', exact: true }).click();
    await page
      .getByLabel('Text (Markdown)')
      .fill('A bug found in review costs minutes. The same bug found in production costs days.');
    await expect(saveState).toHaveText(/Unsaved changes/);
    await expect(saveState).toHaveText(/Saved/);

    await page
      .getByRole('navigation', { name: 'Breadcrumb' })
      .getByRole('link', { name: 'Studio' })
      .click();
    const card = page.getByRole('article').filter({ hasText: 'Testing for Everyone' });
    await expect(card).toContainText('1 parvas · 1 lessons · 0 Parikshas');
    await expect(card).toContainText('Draft');
  });
});
