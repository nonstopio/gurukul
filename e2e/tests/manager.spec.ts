import { GIT_COURSE } from '../support/env';
import { expectNoSeriousViolations } from '../support/a11y';
import { grantRoles } from '../support/emulators';
import { expect, signedInAsLearner, test } from '../support/fixtures';

const neha = { email: 'neha.lead@nonstopio.com', name: 'Neha Lead' };
const joiner = 'new.joiner@nonstopio.com';

/** A day ten days from now, as a date field takes it. */
const inTenDays = () => new Date(Date.now() + 10 * 86_400_000).toLocaleDateString('en-CA');

test.describe('Manager', () => {
  test('creates a team, assigns it a course, changes the due date and removes it', async ({
    page,
  }) => {
    await signedInAsLearner(page, neha);
    await grantRoles(neha.email, ['manager']);
    await page.goto('/team');
    await expect(page.getByRole('heading', { level: 1, name: 'My teams' })).toBeVisible();
    const areas = page.getByRole('navigation', { name: 'Areas' });
    await expect(areas.getByRole('link')).toHaveText(['Learn', 'Team']);
    await expect(page.getByText('No teams yet')).toBeVisible();

    // The rules let a Manager create a team only when it names them a manager.
    await page.getByRole('main').getByRole('button', { name: 'Create team' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Create team' });
    await dialog.getByLabel('Team name').fill('Mobile');
    await dialog.getByRole('combobox', { name: 'Members' }).fill(`${joiner} `);
    await expect(dialog.getByText(joiner)).toBeVisible();
    await dialog.getByRole('button', { name: 'Create team' }).click();
    await expect(page.getByText('Created Mobile')).toBeVisible();
    const teams = page.getByRole('table', { name: 'My teams' });
    await expect(teams.getByRole('row', { name: /Mobile.*1 member/ })).toBeVisible();
    await expectNoSeriousViolations(page);

    // A reload reads the team back through the Manager's own query.
    await page.reload();
    await teams.getByRole('link', { name: 'Mobile' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Mobile' })).toBeVisible();
    const report = page.getByRole('table', { name: 'Mobile: members and their courses' });
    await expect(report.getByRole('row', { name: new RegExp(joiner) })).toContainText(
      'No courses assigned',
    );

    await page.getByRole('link', { name: 'Assign courses' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Assign courses' })).toBeVisible();
    await page.getByRole('checkbox', { name: new RegExp(GIT_COURSE.title) }).check();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Who is it for?' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'People' })).toHaveCount(0);
    // The report handed its team over, already picked.
    await expect(page.getByText('1 person will be assigned. From 1 team: Mobile.')).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Assign to 1 person' }).click();
    await expect(page.getByRole('heading', { name: 'Assigned to 1 person' })).toBeVisible();

    await page.getByRole('link', { name: 'View team report' }).click();
    const row = report.getByRole('row', { name: new RegExp(GIT_COURSE.title) });
    await expect(row).toContainText('Not started');
    await expect(row).toContainText('No due date');
    await expectNoSeriousViolations(page);

    await page
      .getByRole('button', { name: `Change due date of ${GIT_COURSE.title} for ${joiner}` })
      .click();
    const due = page.getByRole('dialog', { name: 'Change due date' });
    await due.getByLabel('Due date').fill(inTenDays());
    await due.getByRole('button', { name: 'Save due date' }).click();
    await expect(page.getByText(`${GIT_COURSE.title} is due`)).toBeVisible();
    await expect(row).not.toContainText('No due date');

    await page.getByRole('button', { name: `Remove ${GIT_COURSE.title} from ${joiner}` }).click();
    await page
      .getByRole('dialog', { name: `Remove ${GIT_COURSE.title}?` })
      .getByRole('button', { name: 'Remove course' })
      .click();
    await expect(page.getByText(`Removed ${GIT_COURSE.title} from ${joiner}`)).toBeVisible();
    await expect(report.getByRole('row', { name: new RegExp(joiner) })).toContainText(
      'No courses assigned',
    );
  });

  test('an Educator sees the teams but cannot change them, and has no Team area', async ({
    page,
  }) => {
    await signedInAsLearner(page, { email: 'kavya.dev@nonstopio.com', name: 'Kavya Dev' });
    await grantRoles('kavya.dev@nonstopio.com', ['educator']);
    await page.goto('/studio/teams');
    const table = page.getByRole('table', { name: 'Teams' });
    await expect(table.getByRole('row', { name: /Educator candidates/ })).toContainText(
      'No manager',
    );
    await expect(page.getByRole('button', { name: 'Create team' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Edit/ })).toHaveCount(0);
    await page.goto('/team');
    await expect(
      page.getByRole('heading', { name: 'You do not have access to this page.' }),
    ).toBeVisible();
  });
});
