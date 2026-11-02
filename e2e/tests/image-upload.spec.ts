import type { Page } from '@playwright/test';
import { expectNoSeriousViolations } from '../support/a11y';
import { grantRoles } from '../support/emulators';
import { expect, signedInAsLearner, test } from '../support/fixtures';
import { makePng } from '../support/png';

const kavya = { email: 'kavya.menon@nonstopio.com', name: 'Kavya Menon' };
const saved = (page: Page) => page.getByRole('status').filter({ hasText: /saved|saving|unsaved/i });

/** A new course with one chapter and an empty lesson, opened in the lesson editor. */
async function openNewLesson(page: Page, title: string, slug: string) {
  await signedInAsLearner(page, kavya);
  await grantRoles(kavya.email, ['educator']);
  await page.goto('/studio');
  await page.getByRole('button', { name: 'New course', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New course' });
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByRole('button', { name: 'Create course' }).click();
  await expect(page).toHaveURL(new RegExp(`/studio/courses/${slug}$`));
  await page.getByLabel('Summary').fill('How a picture gets into a lesson.');
  await page.getByRole('button', { name: 'Add chapter' }).click();
  await page.getByLabel('Title of chapter 1').fill('Pictures');
  await page.getByRole('button', { name: /^Lesson/ }).click();
  await expect(saved(page)).toHaveText(/unsaved changes/);
  await expect(saved(page)).toHaveText(/· saved/);
  await page.getByRole('link', { name: 'Untitled lesson' }).click();
  await page.getByLabel('Lesson title').fill('A branch diagram');
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  // A feature tip may open beside the new tabs; it is not what this test is about.
  await page.keyboard.press('Escape');
}

test.describe('Educator uploads an image', () => {
  test('into a draft lesson, publishes, and a learner sees it', async ({ page }) => {
    await openNewLesson(page, 'Pictures in Lessons', 'pictures-in-lessons');
    await expect(page.getByRole('tab', { name: 'Upload' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(
      page.getByText('WebP, PNG or JPEG · up to 500 KB · 1600 px wide is ideal'),
    ).toBeVisible();
    await expect(page.getByText('No personal data')).toBeVisible();
    await expectNoSeriousViolations(page);

    await page.locator('input[type="file"]').setInputFiles({
      name: 'branches.png',
      mimeType: 'image/png',
      buffer: makePng(1000, 600),
    });
    // Previewed in a lesson-column frame before anything is sent.
    const preview = page.locator('.studio-previewwidth__frame img');
    await expect(preview).toHaveAttribute('src', /^blob:/);
    await expect(page.getByText(/^branches\.png · \d+ KB · 1000 × 600 px$/)).toBeVisible();
    await page.getByRole('button', { name: '390 px' }).click();
    await page.getByLabel('Alt text (required)').fill('Two branches that meet again at a merge');
    await expectNoSeriousViolations(page);

    await page.getByRole('button', { name: 'Upload image' }).click();
    await expect(
      page.getByText(/^Uploaded: branches\.png · \d+ KB · 1000 × 600 px$/),
    ).toBeVisible();
    await expect(page.getByText('Image uploaded')).toBeVisible();
    await expect(page.getByRole('button', { name: /Replace image/ })).toBeVisible();
    // The block now points at the file in Cloud Storage, and it loads.
    await expect(preview).toHaveAttribute(
      'src',
      /127\.0\.0\.1:9199\/v0\/b\/.*courses%2Fpictures-in-lessons%2Fmedia%2F/,
    );
    await expect
      .poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBe(1000);
    await expect(saved(page)).toHaveText(/unsaved changes/);
    await expect(saved(page)).toHaveText(/· saved/);

    // Publish: the address the Studio saved must pass the same check the server runs.
    await page.goto('/studio/courses/pictures-in-lessons');
    await page.getByRole('button', { name: 'Publish v1' }).click();
    const publish = page.getByRole('dialog', { name: 'Publish v1' });
    await publish.getByRole('button', { name: 'Publish v1' }).click();
    await expect(page.getByText('Published v1. Learners see it now.')).toBeVisible();

    // A learner opens the lesson and the picture is there, at its full size.
    await page.goto('/courses/pictures-in-lessons');
    await page.getByRole('link', { name: 'Start course' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'A branch diagram' })).toBeVisible();
    const seen = page.getByRole('img', { name: 'Two branches that meet again at a merge' });
    await expect(seen).toBeVisible();
    await expect(seen).toHaveAttribute('width', '1000');
    await expect.poll(() => seen.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1000);
  });

  test('is refused a file over the limit, with numbers and the prompt, and nothing is uploaded', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openNewLesson(page, 'Big Pictures', 'big-pictures');
    // Random pixels do not compress: 400 x 500 px is about 600 KB, over the 500 KB limit.
    await page.locator('input[type="file"]').setInputFiles({
      name: 'huge.png',
      mimeType: 'image/png',
      buffer: makePng(400, 500, { noise: true }),
    });
    const zone = page.getByRole('button', { name: /Choose an image/ });
    const why = page.locator(`#${(await zone.getAttribute('aria-describedby'))?.split(' ')[1]}`);
    await expect(why).toContainText('This image cannot be uploaded as it is.');
    await expect(why.getByRole('listitem').first()).toContainText(
      /This image is 5\d\d KB and 400 × 500 px\./,
    );
    await expect(why.getByRole('listitem').first()).toContainText('up to 500 KB');
    await expect(page.getByRole('button', { name: 'Upload image' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'How to shrink it by hand' })).toHaveAttribute(
      'href',
      /docs\/educator\.md#shrink-an-image-by-hand$/,
    );
    await expectNoSeriousViolations(page);

    await page.getByRole('button', { name: 'Copy a prompt for your coding agent' }).click();
    await expect(page.getByText('Prompt copied')).toBeVisible();
    const prompt = await page.evaluate(() => navigator.clipboard.readText());
    expect(prompt).toContain('"huge.png"');
    expect(prompt).toContain('under 500 KB');
    // Nothing reached the draft: the block still has no upload.
    await expect(saved(page)).not.toHaveText(/unsaved changes/);
    await expect(page.getByText(/^Uploaded:/)).toHaveCount(0);
  });
});
