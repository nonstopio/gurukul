import type { Block, Course, Lesson } from '@gurukul/schema';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DraftConflictError } from '../src/studio/errors';
import type { Working } from '../src/studio/types';
import { axeViolations } from './axe';
import { makeCourse } from './fake-data';
import { draftDoc, fakeStudio } from './fake-studio';
import { openApp } from './harness';

const blocks = (): Block[] => [
  { type: 'markdown', id: 'b1', md: 'Hello **world**' },
  { type: 'video', id: 'b2', provider: 'youtube', url: 'https://youtu.be/abc123', captions: false },
  { type: 'image', id: 'b3', url: 'https://example.com/a.png', alt: '' },
];
function courseWith(list: Block[] = blocks()): Course {
  const course = makeCourse();
  const first = course.parvas[0]?.items[0];
  if (first?.type === 'lesson') first.blocks = list;
  return course;
}
const PATH = '/studio/courses/git/lessons/l1';
const open = async (course = courseWith(), path = PATH, studio?: ReturnType<typeof fakeStudio>) => {
  const s = studio ?? fakeStudio({ draft: draftDoc(course, { rev: 3 }) });
  const view = await openApp(path, { roles: ['acharya'], studio: s });
  return { ...view, studio: s };
};
const savedLesson = (studio: ReturnType<typeof fakeStudio>, id = 'l1'): Lesson => {
  const call = vi.mocked(studio.data.saveDraft).mock.lastCall;
  const work = call?.[1] as Working;
  return work.course.parvas.flatMap((p) => p.items).find((i) => i.id === id) as Lesson;
};
const saveNow = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save now' }));
  });
};
const blockNames = () =>
  screen.getAllByRole('group').filter((g) => /block$/.test(g.getAttribute('aria-label') ?? ''));

afterEach(() => vi.useRealTimers());

describe('lesson editor: layout', () => {
  it('shows the title, the blocks, the lesson rail and the settings', async () => {
    await open();
    expect(((await screen.findByLabelText('Lesson title')) as HTMLInputElement).value).toBe(
      'Lesson l1',
    );
    expect(blockNames().map((g) => g.getAttribute('aria-label'))).toEqual([
      'Text block',
      'Video block',
      'Image block',
    ]);
    const rail = screen.getByRole('navigation', { name: 'Lessons in this course' });
    expect(
      within(rail)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Lesson l1', 'Lesson l2', 'Lesson l3', 'Pariksha I Pariksha', 'Lesson l4']);
    expect(within(rail).getByRole('link', { name: 'Lesson l1' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(
      within(rail).getByRole('link', { name: 'Lesson l2' }).getAttribute('aria-current'),
    ).toBeNull();
    const settings = screen.getByRole('complementary', { name: 'Lesson settings' });
    expect(within(settings).getByText(/plain JSON/)).toBeTruthy();
    expect(screen.getByText(/^Draft v\d+ · saved/)).toBeTruthy();
  });

  it('has no accessibility violations', async () => {
    const { container } = await open();
    await screen.findByLabelText('Lesson title');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('links to the other lessons and opens them', async () => {
    await open();
    const rail = await screen.findByRole('navigation', { name: 'Lessons in this course' });
    fireEvent.click(within(rail).getByRole('link', { name: 'Lesson l2' }));
    expect(((await screen.findByLabelText('Lesson title')) as HTMLInputElement).value).toBe(
      'Lesson l2',
    );
  });

  it('lists Parikshas in the rail and opens the Pariksha builder', async () => {
    await open();
    const rail = await screen.findByRole('navigation', { name: 'Lessons in this course' });
    expect(
      within(rail)
        .getByRole('link', { name: /Pariksha I/ })
        .getAttribute('href'),
    ).toBe('/studio/courses/git/pariksha/q1');
  });

  it('names untitled items in the rail', async () => {
    const course = courseWith();
    for (const item of course.parvas.flatMap((p) => p.items))
      if (item.id === 'l2' || item.id === 'q1') item.title = '';
    await open(course);
    const rail = await screen.findByRole('navigation', { name: 'Lessons in this course' });
    expect(within(rail).getByRole('link', { name: 'Untitled lesson' })).toBeTruthy();
    expect(within(rail).getByRole('link', { name: /Untitled Pariksha/ })).toBeTruthy();
  });

  it('says so when a lesson has no blocks', async () => {
    await open(courseWith([]));
    expect(await screen.findByText('This lesson is empty.')).toBeTruthy();
  });

  it('shows a loading state, then the lesson', async () => {
    await open();
    expect(await screen.findByLabelText('Lesson title')).toBeTruthy();
  });
});

describe('lesson editor: states', () => {
  it('says so when the lesson does not exist, with a way back', async () => {
    await open(courseWith(), '/studio/courses/git/lessons/nope');
    expect(await screen.findByRole('heading', { name: 'This lesson does not exist' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to the course' }).getAttribute('href')).toBe(
      '/studio/courses/git',
    );
  });

  it('says so when there is no draft', async () => {
    await open(courseWith(), PATH, fakeStudio({ draft: null }));
    expect(await screen.findByRole('heading', { name: /no draft you can edit/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to your courses' })).toBeTruthy();
  });

  it('shows a warning when the draft cannot be loaded', async () => {
    const studio = fakeStudio();
    studio.data.getDraft = vi.fn().mockRejectedValue(new Error('offline'));
    await open(courseWith(), PATH, studio);
    expect(await screen.findByText('This did not load')).toBeTruthy();
  });
});

describe('lesson editor: title and settings', () => {
  it('saves a new title through Save now', async () => {
    const { studio } = await open();
    fireEvent.change(await screen.findByLabelText('Lesson title'), {
      target: { value: 'Branching' },
    });
    expect(screen.getByText(/^Draft v3 · unsaved changes/)).toBeTruthy();
    await saveNow();
    expect(studio.data.saveDraft).toHaveBeenCalledWith('git', expect.anything(), 3, 'u1');
    expect(savedLesson(studio).title).toBe('Branching');
    expect(await screen.findByText(/^Draft v\d+ · saved/)).toBeTruthy();
  });

  it('flags a blank title inline', async () => {
    await open();
    fireEvent.change(await screen.findByLabelText('Lesson title'), { target: { value: '' } });
    expect(screen.getByText('A lesson or Pariksha needs a title.')).toBeTruthy();
    expect(screen.getByLabelText('Lesson title').getAttribute('aria-invalid')).toBe('true');
    expect(
      within(screen.getByRole('navigation', { name: 'Lessons in this course' })).getByText(
        'Untitled lesson',
      ),
    ).toBeTruthy();
  });

  it('changes the layout, minutes, completion rule and type label', async () => {
    const { studio } = await open();
    await screen.findByLabelText('Lesson title');
    const split = screen.getByRole('button', { name: /Split/ });
    expect(split.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(split);
    expect(split.getAttribute('aria-pressed')).toBe('true');
    fireEvent.change(screen.getByLabelText('Estimated minutes'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('Completion rule'), { target: { value: 'video90' } });
    fireEvent.change(screen.getByLabelText('Type label'), { target: { value: 'Hands-on' } });
    await saveNow();
    expect(savedLesson(studio)).toMatchObject({
      layout: 'split',
      minutes: 25,
      completeWhen: 'video90',
      kindLabel: 'Hands-on',
    });
    fireEvent.change(screen.getByLabelText('Type label'), { target: { value: '' } });
    await saveNow();
    expect('kindLabel' in savedLesson(studio)).toBe(false);
  });
});

describe('lesson editor: blocks', () => {
  it.each(['Text', 'Video', 'Code', 'Callout', 'Image', 'Embed', 'File', 'Check'])(
    'adds a %s block from the palette and moves focus into it',
    async (label) => {
      const { studio } = await open(courseWith([]));
      await screen.findByLabelText('Lesson title');
      fireEvent.click(screen.getByRole('button', { name: label }));
      const group = await screen.findByRole('group', { name: `${label} block` });
      await waitFor(() => expect(group.contains(document.activeElement)).toBe(true));
      await waitFor(() => expect(group.className).toContain('g-block--selected'));
      await saveNow();
      const [added] = savedLesson(studio).blocks;
      expect(added?.id).toMatch(/^b-[0-9a-f]{8}$/);
    },
  );

  it('opens the block palette on "/" unless the person is typing', async () => {
    await open();
    const title = (await screen.findByLabelText('Lesson title')) as HTMLInputElement;
    const tile = screen.getByRole('button', { name: 'Text' });
    // Typing in a field with text keeps the slash.
    title.focus();
    expect(fireEvent.keyDown(title, { key: '/' })).toBe(true);
    expect(document.activeElement).toBe(title);
    // A modifier key is left alone.
    expect(fireEvent.keyDown(document.body, { key: '/', ctrlKey: true })).toBe(true);
    // Another key is ignored.
    expect(fireEvent.keyDown(document.body, { key: 'a' })).toBe(true);
    // Outside a field it jumps to the palette.
    expect(fireEvent.keyDown(document.body, { key: '/' })).toBe(false);
    expect(document.activeElement).toBe(tile);
    // An empty field counts as not typing yet.
    fireEvent.change(title, { target: { value: '' } });
    title.focus();
    expect(fireEvent.keyDown(title, { key: '/' })).toBe(false);
    expect(document.activeElement).toBe(tile);
  });

  it('edits a block and saves the change', async () => {
    const { studio } = await open();
    fireEvent.change(await screen.findByLabelText('Text (Markdown)'), {
      target: { value: 'New body' },
    });
    await saveNow();
    expect(savedLesson(studio).blocks[0]).toMatchObject({ id: 'b1', md: 'New body' });
  });

  it('duplicates a block right after the original with a new id', async () => {
    const { studio } = await open();
    await screen.findByLabelText('Lesson title');
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Text block' }));
    expect(blockNames()).toHaveLength(4);
    await saveNow();
    const saved = savedLesson(studio).blocks;
    expect(saved.map((b) => b.type)).toEqual(['markdown', 'markdown', 'video', 'image']);
    expect(saved[1]?.id).not.toBe('b1');
    expect(saved[1]).toMatchObject({ md: 'Hello **world**' });
    expect(screen.getAllByRole('group', { name: 'Text block' })[1]?.className).toContain(
      'g-block--selected',
    );
  });

  it('deletes an untouched block without asking', async () => {
    const { studio } = await open(courseWith([]));
    await screen.findByLabelText('Lesson title');
    fireEvent.click(screen.getByRole('button', { name: 'Callout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Callout block' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Callout block' })).toBeNull();
    await saveNow();
    expect(savedLesson(studio).blocks).toEqual([]);
  });

  it('asks before deleting a block with content, and keeps it on cancel', async () => {
    const { studio } = await open();
    await screen.findByLabelText('Lesson title');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Text block' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this text block?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('group', { name: 'Text block' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Text block' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete block' }));
    expect(screen.queryByRole('group', { name: 'Text block' })).toBeNull();
    await saveNow();
    expect(savedLesson(studio).blocks.map((b) => b.id)).toEqual(['b2', 'b3']);
  });

  it('reorders with the keyboard: Space lifts, arrows move, Space drops', async () => {
    const { studio } = await open();
    await screen.findByLabelText('Lesson title');
    const grip = screen.getByRole('button', { name: 'Move Text block' });
    grip.focus();
    fireEvent.keyDown(grip, { key: ' ' });
    fireEvent.keyDown(grip, { key: 'ArrowDown' });
    fireEvent.keyDown(grip, { key: 'ArrowDown' });
    fireEvent.keyDown(grip, { key: ' ' });
    expect(blockNames().map((g) => g.getAttribute('aria-label'))).toEqual([
      'Video block',
      'Image block',
      'Text block',
    ]);
    await saveNow();
    expect(savedLesson(studio).blocks.map((b) => b.id)).toEqual(['b2', 'b3', 'b1']);
  });

  it('moves one place with Alt and an arrow key', async () => {
    await open();
    await screen.findByLabelText('Lesson title');
    fireEvent.keyDown(screen.getByRole('button', { name: 'Move Image block' }), {
      key: 'ArrowUp',
      altKey: true,
    });
    expect(blockNames().map((g) => g.getAttribute('aria-label'))).toEqual([
      'Text block',
      'Image block',
      'Video block',
    ]);
  });

  it('selects the block you work in and keeps it when focus leaves the canvas', async () => {
    await open();
    const title = await screen.findByLabelText('Lesson title');
    const video = screen.getByRole('group', { name: 'Video block' });
    fireEvent.focusIn(within(video).getByLabelText('Video link'));
    await waitFor(() => expect(video.className).toContain('g-block--selected'));
    expect(screen.getByRole('group', { name: 'Text block' }).className).not.toContain(
      'g-block--selected',
    );
    fireEvent.focusIn(title);
    expect(video.className).toContain('g-block--selected');
  });

  it('selects a block focused the moment it appears, before React runs its effects', async () => {
    // A MutationObserver fires as soon as the block is in the page: earlier than a plain effect
    // would attach the focus listener, which is how CI once missed this focus.
    const seen = new MutationObserver(() => {
      const field = document.querySelector<HTMLElement>('[aria-label="Video block"] input');
      if (!field) return;
      seen.disconnect();
      fireEvent.focusIn(field);
    });
    seen.observe(document.body, { childList: true, subtree: true });
    await open();
    const video = await screen.findByRole('group', { name: 'Video block' });
    await waitFor(() => expect(video.className).toContain('g-block--selected'));
  });

  it('shows the publish problem for a block inside its frame', async () => {
    await open();
    const image = (await screen.findByRole('group', { name: 'Image block' })) as HTMLElement;
    expect(within(image).getByRole('alert').textContent).toContain('An image needs alt text');
    expect(screen.getByRole('group', { name: 'Text block' }).className).not.toContain(
      'g-block--error',
    );
    fireEvent.change(within(image).getByLabelText('Alt text (required)'), {
      target: { value: 'A diagram' },
    });
    expect(within(image).queryByRole('alert')).toBeNull();
  });
});

describe('lesson editor: saving', () => {
  it('autosaves a second after the last edit', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { studio } = await open();
    fireEvent.change(await screen.findByLabelText('Lesson title'), { target: { value: 'Auto' } });
    expect(studio.data.saveDraft).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    expect(studio.data.saveDraft).toHaveBeenCalledTimes(1);
    expect(savedLesson(studio).title).toBe('Auto');
    expect(await screen.findByText(/^Draft v\d+ · saved/)).toBeTruthy();
  });

  it('offers a retry when a save fails', async () => {
    const { studio } = await open();
    vi.mocked(studio.data.saveDraft).mockRejectedValueOnce(new Error('offline'));
    fireEvent.change(await screen.findByLabelText('Lesson title'), { target: { value: 'X' } });
    await saveNow();
    const retry = await screen.findByRole('button', { name: /Couldn.t save — retry/ });
    await act(async () => {
      fireEvent.click(retry);
    });
    expect(studio.data.saveDraft).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/^Draft v\d+ · saved/)).toBeTruthy();
  });

  it('explains a conflict and reloads the stored draft', async () => {
    const { studio } = await open();
    vi.mocked(studio.data.saveDraft).mockRejectedValueOnce(new DraftConflictError());
    fireEvent.change(await screen.findByLabelText('Lesson title'), { target: { value: 'Mine' } });
    await saveNow();
    expect(await screen.findByText('Someone else saved this course')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: /Couldn.t save — retry/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(((await screen.findByLabelText('Lesson title')) as HTMLInputElement).value).toBe(
      'Lesson l1',
    );
    expect(studio.data.getDraft).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Someone else saved this course')).toBeNull();
  });
});

describe('lesson editor: preview', () => {
  it('saves, then opens the learner preview', async () => {
    const { studio, router } = await open();
    fireEvent.change(await screen.findByLabelText('Lesson title'), {
      target: { value: 'Before preview' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: 'Preview as learner' }));
    });
    expect(savedLesson(studio).title).toBe('Before preview');
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/studio/courses/git/preview/l1'),
    );
  });

  it('stays on the page and says so when the save fails', async () => {
    const { studio, router } = await open();
    vi.mocked(studio.data.saveDraft).mockRejectedValueOnce(new Error('offline'));
    fireEvent.change(await screen.findByLabelText('Lesson title'), { target: { value: 'X' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: 'Preview as learner' }));
    });
    expect(await screen.findByText(/preview would be out of date/)).toBeTruthy();
    expect(router.state.location.pathname).toBe(PATH);
  });
});
