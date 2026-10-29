import { GIT_COURSE } from '../support/env';
import { expectNoSeriousViolations } from '../support/a11y';
import { grantRoles } from '../support/emulators';
import { expect, signedInAsShishya, test } from '../support/fixtures';

const meera = { email: 'meera.iyer@nonstopio.com', name: 'Meera Iyer' };
const invitees = ['new.joiner@nonstopio.com', 'second.joiner@nonstopio.com'];

test.describe('Kulapati', () => {
  test('assigns a course to two people who have not signed in, and sees the pending invites', async ({
    page,
  }) => {
    await signedInAsShishya(page, meera);
    await grantRoles(meera.email, ['kulapati']);
    // A fresh load picks the new claims up from the start.
    await page.goto('/kulapati');
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Lessons completed per week' })).toBeVisible();
    await expectNoSeriousViolations(page);

    await page.getByRole('main').getByRole('link', { name: 'Assign courses' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Assign courses' })).toBeVisible();
    await page.getByRole('checkbox', { name: new RegExp(GIT_COURSE.title) }).check();

    // Paste the addresses (and one personal address that must be refused) into the chip box.
    await page.getByLabel('Email addresses').evaluate(
      (input, text) => {
        const data = new DataTransfer();
        data.setData('text', text);
        input.dispatchEvent(
          new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
        );
      },
      [...invitees, 'someone@gmail.com'].join('\n'),
    );

    const chips = page.getByRole('list', { name: 'Email addresses: added emails' });
    for (const email of invitees) {
      await expect(chips.getByRole('listitem').filter({ hasText: email })).toContainText('new');
    }
    const summary = page.getByRole('complementary', { name: 'Summary' });
    await expect(summary.getByText('New (pending invite)').locator('+ dd')).toHaveText('2');
    await expect(summary.getByText('Rejected', { exact: true }).locator('+ dd')).toHaveText('1');
    await expect(summary.getByRole('list', { name: 'Rejected addresses' })).toContainText(
      'someone@gmail.com',
    );

    await summary.getByRole('button', { name: 'Assign to 2 people' }).click();

    await expect(page).toHaveURL(/\/kulapati\/learners$/);
    await page.getByRole('tab', { name: /^Pending invite \(2\)/ }).click();
    const table = page.getByRole('table', { name: 'Learners' });
    for (const email of invitees) {
      await expect(table.getByRole('row').filter({ hasText: email })).toContainText(
        'Pending invite',
      );
    }
  });

  test('adds teams and turns reminders on, and the settings survive a reload', async ({ page }) => {
    await signedInAsShishya(page, meera);
    await grantRoles(meera.email, ['kulapati']);
    await page.goto('/kulapati/settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Org settings' })).toBeVisible();
    // The seed's default: no teams, reminders off.
    await expect(page.getByText('No teams yet')).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Send daily reminders' })).not.toBeChecked();

    for (const team of ['Mobile', 'Quality']) {
      await page.getByLabel('New team').fill(team);
      await page.getByRole('button', { name: 'Add team' }).click();
    }
    // The switch's track covers its input, so click the label, as a person does.
    await page.getByText('Send daily reminders').click();
    await expect(page.getByRole('switch', { name: 'Send daily reminders' })).toBeChecked();
    await expectNoSeriousViolations(page);
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Settings saved')).toBeVisible();

    await page.reload();
    const teams = page.getByRole('list', { name: 'Teams' });
    await expect(teams.getByRole('listitem')).toHaveText([/Mobile/, /Quality/]);
    await expect(page.getByRole('switch', { name: 'Send daily reminders' })).toBeChecked();

    // Meera has no team yet, so Home now asks her to pick one from the saved list.
    await page.goto('/');
    const prompt = page.getByRole('heading', { name: 'Which team are you in?' });
    await expect(prompt).toBeVisible();
    await page.getByLabel('Team', { exact: true }).selectOption('Quality');
    await page.getByRole('button', { name: 'Save team' }).click();
    await expect(prompt).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: /Namaste/ })).toBeVisible();
    await expect(prompt).toHaveCount(0);
  });

  test('a Shishya cannot open the Kulapati console', async ({ page }) => {
    await signedInAsShishya(page, { email: 'ravi.nair@nonstopio.com', name: 'Ravi Nair' });
    await page.goto('/kulapati');
    await expect(
      page.getByRole('heading', { name: 'You do not have access to this page.' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Overview' })).toHaveCount(0);
  });
});
