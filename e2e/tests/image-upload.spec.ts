import type { Page } from '@playwright/test';
import { expectNoSeriousViolations } from '../support/a11y';
import { grantRoles, storedBlurHash } from '../support/emulators';
import { expect, signedInAsLearner, test } from '../support/fixtures';
import { makePdf } from '../support/pdf';
import { makePng } from '../support/png';

const kavya = { email: 'kavya.menon@nonstopio.com', name: 'Kavya Menon' };
const saved = (page: Page) => page.getByRole('status').filter({ hasText: /saved|saving|unsaved/i });

/** A new course with one chapter and an empty lesson, opened in the lesson editor. */
async function openNewLesson(page: Page, title: string, slug: string, block = 'Image') {
  await signedInAsLearner(page, kavya);
  await grantRoles(kavya.email, ['educator']);
  await page.goto('/studio');
  await page.getByRole('button', { name: 'New course', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New course' });
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByRole('button', { name: 'Create course' }).click();
  await expect(page).toHaveURL(new RegExp(`/studio/courses/${slug}$`));
  await page.getByLabel('Summary').fill('How a picture gets into a lesson.');
  // Publishing needs a landing page description and at least two outcomes.
  await page.getByRole('tab', { name: 'Landing page' }).click();
  await page
    .getByLabel('Description')
    .fill('For Educators who add pictures and handouts to lessons.');
  await page.getByRole('button', { name: 'Add outcome' }).click();
  await page.getByLabel('Outcome 1').fill('Upload an image with alt text');
  await page.getByRole('button', { name: 'Add outcome' }).click();
  await page.getByLabel('Outcome 2').fill('Attach a PDF handout');
  await page.getByRole('tab', { name: 'Structure' }).click();
  await page.getByRole('button', { name: 'Add chapter' }).click();
  await page.getByLabel('Title of chapter 1').fill('Pictures');
  await page.getByRole('button', { name: /^Lesson/ }).click();
  await expect(saved(page)).toHaveText(/unsaved changes/);
  await expect(saved(page)).toHaveText(/· saved/);
  await page.getByRole('link', { name: 'Untitled lesson' }).click();
  await page.getByLabel('Lesson title').fill('A branch diagram');
  await page.getByRole('button', { name: block, exact: true }).click();
  // A feature tip may open beside the new tabs; it is not what this test is about.
  await page.keyboard.press('Escape');
  // A new block opens on Link; these tests are about Upload.
  await expect(page.getByRole('tab', { name: 'Link' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Upload' }).click();
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
    // Studio kept a BlurHash (4 x 3 components: 28 characters) of the real picture, and the page
    // shows it only until the image has loaded; it is gone, and nothing has jumped, by then.
    expect(await storedBlurHash('courses/pictures-in-lessons')).toMatch(/^.{28}$/);
    await expect(page.locator('.g-figure__blur')).toHaveCount(0);
    await expect(seen).toHaveAttribute('width', '1000');
    await expect.poll(() => seen.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1000);

    // With no cover image of its own, the course's card in Studio shows that first picture.
    await page.goto('/studio');
    const card = page.getByRole('listitem').filter({ hasText: 'Pictures in Lessons' });
    const cover = card.locator('img');
    await expect(cover).toHaveAttribute('src', /courses%2Fpictures-in-lessons%2Fmedia%2F/);
    await expect.poll(() => cover.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1000);
    await expect(card.getByText('Published · v1')).toBeVisible();
    await expectNoSeriousViolations(page);
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

test.describe('Educator uploads a PDF', () => {
  test('into a draft lesson, publishes, and a learner opens it from Storage', async ({ page }) => {
    await openNewLesson(page, 'Handouts in Lessons', 'handouts-in-lessons', 'File');
    await expect(page.getByRole('tab', { name: 'Upload' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByText('PDF only · up to 1.0 MB')).toBeVisible();
    await expect(page.getByText('No personal data')).toBeVisible();
    await expectNoSeriousViolations(page);

    await page.locator('input[type="file"]').setInputFiles({
      name: 'branching-cheat-sheet.pdf',
      mimeType: 'application/pdf',
      buffer: makePdf({ padding: 20 * 1024 }),
    });
    await expect(page.getByText(/^branching-cheat-sheet\.pdf · \d+ KB$/)).toBeVisible();
    await expectNoSeriousViolations(page);
    await page.getByRole('button', { name: 'Upload PDF' }).click();
    await expect(page.getByText('PDF uploaded')).toBeVisible();
    await expect(page.getByText(/^Uploaded: branching-cheat-sheet\.pdf · \d+ KB$/)).toBeVisible();
    // The label started as the file name without its extension, and the preview is the player's own.
    await expect(page.getByLabel('Label', { exact: true })).toHaveValue('branching-cheat-sheet');
    await expect(page.locator('.studio-previewwidth__frame .file-link')).toHaveText(
      /^branching-cheat-sheet · PDF · \d+ KB$/,
    );
    await page.getByLabel('Label', { exact: true }).fill('Branching cheat sheet');
    await expect(saved(page)).toHaveText(/unsaved changes/);
    await expect(saved(page)).toHaveText(/· saved/);

    await page.goto('/studio/courses/handouts-in-lessons');
    await page.getByRole('button', { name: 'Publish v1' }).click();
    const publish = page.getByRole('dialog', { name: 'Publish v1' });
    await publish.getByRole('button', { name: 'Publish v1' }).click();
    await expect(page.getByText('Published v1. Learners see it now.')).toBeVisible();

    await page.goto('/courses/handouts-in-lessons');
    await page.getByRole('link', { name: 'Start course' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'A branch diagram' })).toBeVisible();
    const link = page.getByRole('link', { name: /^Branching cheat sheet · PDF · \d+ KB$/ });
    await expect(link).toBeVisible();
    // The first page was drawn in the browser with pdf.js and hashed: the link carries its thumbnail.
    expect(await storedBlurHash('courses/handouts-in-lessons')).toMatch(/^.{28}$/);
    await expect(link.locator('.file-link__thumb')).toBeVisible();
    await expect(link).toHaveAttribute(
      'href',
      /127\.0\.0\.1:9199\/v0\/b\/.*courses%2Fhandouts-in-lessons%2Fmedia%2F.*\.pdf/,
    );
    const href = (await link.getAttribute('href')) as string;
    const response = await page.request.get(href);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/pdf');
    expect((await response.body()).subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('is refused a PDF over 1 MB with the numbers, and Switch to Link takes over', async ({
    page,
  }) => {
    await openNewLesson(page, 'Big Handouts', 'big-handouts', 'File');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'scan.pdf',
      mimeType: 'application/pdf',
      buffer: makePdf({ padding: 1100 * 1024 }),
    });
    const zone = page.getByRole('button', { name: /Choose a PDF/ });
    const why = page.locator(`#${(await zone.getAttribute('aria-describedby'))?.split(' ')[1]}`);
    await expect(why).toContainText('This PDF cannot be uploaded as it is.');
    await expect(why.getByRole('listitem').first()).toContainText(/This PDF is 1\.\d MB\./);
    await expect(why.getByRole('listitem').first()).toContainText('GitHub or Google Drive');
    await expect(why.getByRole('button', { name: /Copy a prompt/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload PDF' })).toHaveCount(0);
    await expectNoSeriousViolations(page);

    await why.getByRole('button', { name: 'Switch to Link' }).click();
    await expect(page.getByRole('tab', { name: 'Link' })).toHaveAttribute('aria-selected', 'true');
    await page.getByLabel('File address').fill('https://drive.google.com/file/d/abc/view');
    // Nothing was uploaded: only the typed link is in the draft.
    await expect(page.getByText(/^Uploaded:/)).toHaveCount(0);
  });
});
