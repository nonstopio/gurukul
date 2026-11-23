import type { Page } from '@playwright/test';
import type { Desktop, FakeStep } from '../support/desktop';
import { expect, signInToDesktop, test } from '../support/desktop';
import { desktopSpecsSkipped } from '../support/desktop-platform.mjs';
import { grantRoles, readDoc, readDraft, saveDraftAs } from '../support/emulators';
import { APP_URL, GIT_COURSE } from '../support/env';

/*
 * Gurukul Studio, the desktop app, end to end (`DSK-24`, `.plan/22-desktop-studio.md`, Testing): the
 * built shell over the e2e app and the emulators, with a fake Claude Code that replays stream-json
 * and makes its tool calls over the shell's real MCP endpoint, so the tools really change the
 * session's working copy. Nothing here calls Anthropic, Google or any other internet host.
 */

const kavya = { email: 'kavya.menon@nonstopio.com', name: 'Kavya Menon' };
const FIRST_LESSON = 'what-git-solves';

// A session is a few round trips through the shell and the emulators: more than the web specs.
test.describe.configure({ timeout: 120_000 });

/** Signs Kavya in inside the app with these roles and opens the Studio course list. */
async function openStudio(desktop: Desktop, roles: Array<'educator' | 'admin'>): Promise<Page> {
  const { window } = desktop;
  await signInToDesktop(desktop, kavya);
  await grantRoles(kavya.email, roles);
  await window.goto(`${APP_URL}/studio`);
  await expect(window.getByRole('heading', { level: 1, name: 'Courses' })).toBeVisible();
  return window;
}

/** Waits for the session's workspace, opened straight away, its agent ready for a message. */
async function startSession(window: Page): Promise<void> {
  await expect(window).toHaveURL(/\/studio\/sessions\/[\w-]+$/);
  await expect(window.getByRole('heading', { name: 'Chat' })).toBeVisible();
}

/** Sends one message and waits for the turn to be written: its line under the chat. */
async function sendMessage(window: Page, text: string, turn: string | RegExp): Promise<void> {
  await window.getByLabel('Ask for a change').fill(text);
  await window.getByRole('button', { name: 'Send' }).click();
  await expect(window.getByRole('link', { name: turn })).toBeVisible();
}

/** The fake agent's turn: rename a lesson, then say so. */
const renameLesson = (itemId: string, title: string): FakeStep[] => [
  { tool: 'update_item', input: { itemId, title } },
  { text: 'I renamed the lesson.' },
];

const skipped = desktopSpecsSkipped(process.platform);

test.describe('Gurukul Studio desktop app', () => {
  // Windows runs the web specs only; the shell is not even bundled there (desktop-platform.mjs).
  test.skip(skipped !== null, skipped ?? '');

  test('an edit session changes a lesson, and Save to draft writes it to the draft', async ({
    desktop,
  }) => {
    await desktop.setScenario({
      turns: [renameLesson(FIRST_LESSON, 'What Git solves for a team')],
    });
    const window = await openStudio(desktop, ['educator', 'admin']);
    const before = await readDraft(GIT_COURSE.id);

    await window.getByRole('button', { name: `Edit with AI: ${GIT_COURSE.title}` }).click();
    await startSession(window);
    await sendMessage(
      window,
      'Rename the first lesson for teams.',
      '1 change in turn 1, open in Review',
    );
    // The agent's tool call came back through the shell and changed the working copy.
    await expect(window.getByText('tool: Updated what-git-solves.')).toBeVisible();
    await expect(window.getByText('1 change · checks pass')).toBeVisible();
    // Nothing is written to Firestore before Save to draft.
    expect((await readDraft(GIT_COURSE.id)).rev).toBe(before.rev);

    await window.getByRole('link', { name: 'Review', exact: true }).click();
    const changes = window.getByRole('list', { name: 'Changes' });
    await expect(changes.getByText('What Git solves for a team')).toBeVisible();
    // Review is one decision at the end: no change has a button of its own to accept it.
    await expect(window.getByRole('button', { name: /^Accept/ })).toHaveCount(0);

    await window.getByRole('button', { name: 'Save 1 change to draft' }).click();
    const confirm = window.getByRole('dialog', { name: 'Save to draft?' });
    await confirm.getByRole('button', { name: 'Save 1 change to draft' }).click();
    await expect(window.getByRole('heading', { name: 'Saved to the draft' })).toBeVisible();

    const after = await readDraft(GIT_COURSE.id);
    expect(after.rev).toBe(before.rev + 1);
    expect(after.course).toContain('"stringValue":"What Git solves for a team"');
    expect(after.course).not.toContain('"stringValue":"What Git solves"');
    // A published course keeps its publishedAt as a Firestore timestamp through the session.
    expect(after.publishedAt).toEqual(before.publishedAt);
    expect(await desktop.sessionStarts()).toBe(1);
  });

  test('a new course session adds a chapter and a lesson, and Create course saves it', async ({
    desktop,
  }) => {
    await desktop.setScenario({
      turns: [
        [
          { tool: 'set_course_details', input: { title: 'Pairing at NonStop' } },
          {
            tool: 'add_chapter',
            input: { title: 'Why we pair' },
            capture: { chapter: 'Added chapter (\\S+) at' },
          },
          {
            tool: 'add_lesson',
            input: { chapterId: '${chapter}', title: 'Two people, one keyboard' },
            capture: { lesson: 'Added lesson (\\S+) at' },
          },
          {
            tool: 'add_block',
            input: {
              lessonId: '${lesson}',
              block: { type: 'markdown', md: 'One person types; the other reads every line.' },
            },
          },
          { text: 'The course has its first chapter and lesson.' },
        ],
      ],
    });
    const window = await openStudio(desktop, ['educator']);

    await window.getByRole('button', { name: 'New course with AI' }).click();
    await startSession(window);
    await sendMessage(window, 'Start with why we pair.', /^\d+ changes in turn 1, open in Review$/);
    expect(await readDoc('courses/pairing-at-nonstop')).toBeUndefined();

    await window.getByRole('link', { name: 'Review', exact: true }).click();
    await expect(window.getByRole('heading', { name: 'Outline' })).toBeVisible();
    await window.getByRole('button', { name: 'Create course and save draft' }).click();
    const dialog = window.getByRole('dialog', { name: 'Create the course' });
    await expect(dialog.getByLabel('Title')).toHaveValue('Pairing at NonStop');
    await expect(dialog.getByLabel('Address')).toHaveValue('pairing-at-nonstop');
    await dialog.getByRole('button', { name: 'Create course and save draft' }).click();
    await expect(window.getByRole('heading', { name: 'Saved to the draft' })).toBeVisible();

    const course = await readDoc('courses/pairing-at-nonstop');
    expect(course?.title).toEqual({ stringValue: 'Pairing at NonStop' });
    const draft = await readDraft('pairing-at-nonstop');
    expect(draft.course).toContain('"stringValue":"Why we pair"');
    expect(draft.course).toContain('"stringValue":"Two people, one keyboard"');
    expect(draft.course).toContain('One person types; the other reads every line.');
  });

  test('a draft saved during the session is brought in, a conflict settled, then saved', async ({
    desktop,
  }) => {
    await desktop.setScenario({
      turns: [renameLesson(FIRST_LESSON, 'What Git solves, in one page')],
    });
    const window = await openStudio(desktop, ['educator', 'admin']);
    await window.getByRole('button', { name: `Edit with AI: ${GIT_COURSE.title}` }).click();
    await startSession(window);
    await sendMessage(
      window,
      'Give the first lesson a shorter title.',
      '1 change in turn 1, open in Review',
    );

    // Meanwhile someone saves the draft in the browser: the same lesson, and another one.
    await saveDraftAs(GIT_COURSE.id, 'arjun-uid', (course) =>
      course
        .replace('"stringValue":"What Git solves"', '"stringValue":"What Git solves (Arjun)"')
        .replace(
          '"stringValue":"Install and configure Git"',
          '"stringValue":"Install Git on your laptop"',
        ),
    );
    const theirs = await readDraft(GIT_COURSE.id);

    await window.getByRole('link', { name: 'Review', exact: true }).click();
    await window.getByRole('button', { name: 'Save 1 change to draft' }).click();
    await window
      .getByRole('dialog', { name: 'Save to draft?' })
      .getByRole('button', { name: 'Save 1 change to draft' })
      .click();
    // The save's own check found the draft moved: nothing was written over their work.
    await expect(window.getByText(/after this session started/)).toBeVisible();
    expect((await readDraft(GIT_COURSE.id)).rev).toBe(theirs.rev);

    await window.getByRole('button', { name: 'Bring in their changes' }).click();
    const merge = window.getByRole('dialog', { name: 'Bring in their changes' });
    const bringIn = merge.getByRole('button', { name: 'Bring in their changes' });
    await expect(bringIn).toBeDisabled();
    await merge.getByRole('radio', { name: 'Keep this session’s' }).check();
    await bringIn.click();
    await expect(merge).toBeHidden();
    // Its toast sits over the footer's Save until it goes; an Educator closes it.
    const done = window.getByRole('status').filter({ hasText: 'Their changes are in.' });
    await done.getByRole('button', { name: 'Dismiss' }).click();
    await expect(done).toBeHidden();

    await window.getByRole('button', { name: /^Save \d+ changes? to draft$/ }).click();
    await window
      .getByRole('dialog', { name: 'Save to draft?' })
      .getByRole('button', { name: /^Save \d+ changes? to draft$/ })
      .click();
    await expect(window.getByRole('heading', { name: 'Saved to the draft' })).toBeVisible();

    const saved = await readDraft(GIT_COURSE.id);
    expect(saved.rev).toBe(theirs.rev + 1);
    // The conflict went the session's way; their other change came in untouched.
    expect(saved.course).toContain('"stringValue":"What Git solves, in one page"');
    expect(saved.course).not.toContain('What Git solves (Arjun)');
    expect(saved.course).toContain('"stringValue":"Install Git on your laptop"');
  });
});
