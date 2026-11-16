import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axeViolations } from './axe';
import type { CourseListing } from '@gurukul/schema';
import { fakeData, lesson, listing, makeCourse } from './fake-data';
import { draftDoc, fakeStudio } from './fake-studio';
import { openApp } from './harness';
import { apiFailure } from './studio-fixtures';
import { choose } from './select';

vi.mock('../src/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

function rows() {
  const live = makeCourse({ id: 'git', title: 'Git', educatorIds: ['u1'], version: 2 });
  const edited = makeCourse({
    id: 'git',
    title: 'Git',
    educatorIds: ['u1'],
    version: 2,
    chapters: [{ id: 'p1', title: 'Basics', items: [lesson('l1', { title: 'Changed' })] }],
  });
  const draftOnly = makeCourse({
    id: 'new',
    title: 'Brand new',
    status: 'draft',
    version: 0,
    educatorIds: ['u1'],
  });
  const one = makeCourse({
    id: 'one',
    title: 'One edit',
    educatorIds: ['u1'],
    chapters: [{ id: 'p1', title: 'Basics', items: [lesson('l1')] }],
  });
  const oneDraft = makeCourse({
    ...one,
    title: 'One edit',
    chapters: one.chapters,
    summary: 'Changed',
  });
  return [
    { live, draft: draftDoc(edited, { updatedAt: hoursAgo(2) }) },
    { live: draftOnly, draft: draftDoc(draftOnly, { updatedAt: null }) },
    { live: one, draft: draftDoc(oneDraft, { updatedAt: hoursAgo(0) }) },
    {
      live: makeCourse({
        id: 'other',
        title: 'Not mine',
        educatorIds: ['x'],
        educatorNames: { x: 'Rohan Das' },
      }),
      draft: null,
    },
    {
      live: makeCourse({ id: 'old', title: 'Retired', status: 'archived', educatorIds: ['x'] }),
      draft: null,
    },
  ];
}

describe('Courses in global search for Educators', () => {
  it('finds a never-published draft and opens it in the course editor', async () => {
    const studio = fakeStudio({ courses: rows() });
    const app = await openApp('/', { roles: ['educator'], studio });
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'brand new' } });
    const option = await screen.findByRole('option', { name: /Brand new.*Studio/ });
    // The summaries only: no draft is read to search.
    expect(studio.data.listLiveCourses).toHaveBeenCalledTimes(1);
    expect(studio.data.getDraft).not.toHaveBeenCalled();
    expect(screen.queryByRole('option', { name: /Not mine/ })).toBeNull();
    fireEvent.click(option);
    await waitFor(() => expect(app.router.state.location.pathname).toBe('/studio/courses/new'));
  });

  it('is not loaded for a Learner', async () => {
    const studio = fakeStudio({ courses: rows() });
    await openApp('/', { studio });
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'brand new' } });
    expect(await screen.findByRole('combobox')).toBeTruthy();
    expect(studio.data.listLiveCourses).not.toHaveBeenCalled();
  });
});

describe('Studio courses page', () => {
  it('keeps the tab in the address', async () => {
    const studio = fakeStudio({ courses: rows() });
    const app = await openApp('/studio?tab=drafts', { roles: ['educator'], studio });
    expect(
      (await screen.findByRole('tab', { name: 'Drafts (1)' })).getAttribute('aria-selected'),
    ).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: 'Published (3)' }));
    expect(app.router.state.location.search).toBe('?tab=published');
  });

  it('lists courses with status, edits and view-only cards', async () => {
    const studio = fakeStudio({ courses: rows() });
    studio.data.courseFacts = vi.fn(async (id: string) => ({
      edited: id === 'git' ? true : id === 'one' ? null : false,
      learners: id === 'git' ? 12 : id === 'one' ? 1 : null,
    }));
    await openApp('/studio', { roles: ['educator'], studio });
    expect(await screen.findByRole('heading', { name: 'Courses' })).toBeTruthy();
    expect(screen.getByText(/chapter by chapter/)).toBeTruthy();
    expect(await screen.findByRole('tab', { name: 'All (5)' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Published (3)' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Drafts (1)' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Git' }).getAttribute('href')).toBe(
      '/studio/courses/git',
    );
    // What a summary cannot know is asked per card, only for the courses this person may edit,
    // and never by reading a draft.
    expect(await screen.findAllByText('Unpublished edits')).toHaveLength(1);
    expect(screen.getByText('12 learners')).toBeTruthy();
    expect(screen.getByText('1 learner')).toBeTruthy();
    expect(
      vi
        .mocked(studio.data.courseFacts)
        .mock.calls.map(([id]) => id)
        .sort(),
    ).toEqual(['git', 'new', 'one']);
    expect(studio.data.courseFacts).toHaveBeenCalledWith('new', null);
    expect(studio.data.getDraft).not.toHaveBeenCalled();
    expect(screen.getByText('Not published yet. Open it to see the draft.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Not mine' })).toBeNull();
    expect(screen.getByText('View only — Educator: Rohan Das')).toBeTruthy();
    expect(screen.getByText('View only')).toBeTruthy();
    expect(screen.getByText('Archived')).toBeTruthy();
    expect(screen.getByText('Published · v2')).toBeTruthy();
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it("shows the first lesson image as a card's picture, and the name when it fails to load", async () => {
    const pictured = makeCourse({
      id: 'pic',
      title: 'Pictured',
      educatorIds: ['u1'],
      chapters: [
        {
          id: 'p1',
          title: 'Basics',
          items: [
            lesson('l1'),
            lesson('l2', {
              blocks: [
                { type: 'image', id: 'i1', url: 'https://example.com/cover.png', alt: 'A desk' },
              ],
            }),
          ],
        },
      ],
    });
    const studio = fakeStudio({ courses: [{ live: pictured, draft: null }] });
    await openApp('/studio', { roles: ['educator'], studio });
    await screen.findByRole('link', { name: 'Pictured' });
    const image = document.querySelector(
      'img[src="https://example.com/cover.png"]',
    ) as HTMLImageElement;
    expect(image).toBeTruthy();
    // With its picture, the cover does not repeat the name: only the heading's link has it.
    expect(screen.getAllByText('Pictured')).toHaveLength(1);
    fireEvent.error(image);
    expect(document.querySelector('img[src="https://example.com/cover.png"]')).toBeNull();
    expect(screen.getAllByText('Pictured')).toHaveLength(2);
  });

  it('says only "View only" for a course summarised before Educator names were kept', async () => {
    const studio = fakeStudio();
    const old: Partial<CourseListing> = listing(
      makeCourse({
        id: 'old',
        title: 'Old summary',
        educatorIds: ['x'],
        educatorNames: { x: 'Rohan Das' },
      }),
    );
    delete old.educatorNames;
    studio.data.listLiveCourses = vi.fn().mockResolvedValue([old]);
    await openApp('/studio', { roles: ['educator'], studio });
    expect(await screen.findByText('View only')).toBeTruthy();
    expect(studio.data.courseFacts).not.toHaveBeenCalled();
  });

  it('draws a card from the published course, and reads no draft for it', async () => {
    const withImage = (url: string) =>
      makeCourse({
        id: 'pic',
        title: 'Pictured',
        educatorIds: ['u1'],
        chapters: [
          {
            id: 'p1',
            title: 'Basics',
            items: [lesson('l1', { blocks: [{ type: 'image', id: 'i1', url, alt: 'A desk' }] })],
          },
        ],
      });
    const live = withImage('https://example.com/live.png');
    const draft = draftDoc(withImage('https://example.com/draft.png'), { updatedAt: hoursAgo(1) });
    const studio = fakeStudio({ courses: [{ live, draft }] });
    await openApp('/studio', { roles: ['educator'], studio });
    await screen.findByRole('link', { name: 'Pictured' });
    expect(document.querySelector('img[src="https://example.com/live.png"]')).toBeTruthy();
    expect(document.querySelector('img[src="https://example.com/draft.png"]')).toBeNull();
    expect(studio.data.getDraft).not.toHaveBeenCalled();
  });

  it('filters by tab and explains an empty tab', async () => {
    const studio = fakeStudio({ courses: [rows()[0] as never] });
    await openApp('/studio', { roles: ['educator'], studio });
    fireEvent.click(await screen.findByRole('tab', { name: 'Drafts (0)' }));
    expect(screen.getByRole('heading', { name: 'No drafts' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Published (1)' }));
    expect(screen.getByRole('link', { name: 'Git' })).toBeTruthy();
  });

  it('pages 25 courses at a time, and starts again at page one on another tab', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      live: makeCourse({
        id: `c${i}`,
        title: `Course ${String(i).padStart(2, '0')}`,
        educatorIds: ['u1'],
      }),
      draft: null,
    }));
    await openApp('/studio', { roles: ['educator'], studio: fakeStudio({ courses: many }) });
    expect(await screen.findByRole('link', { name: 'Course 00' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Course 25' })).toBeNull();
    expect(screen.getByText('Showing 1–25 of 30')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('link', { name: 'Course 25' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Course 00' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Published (30)' }));
    expect(screen.getByText('Showing 1–25 of 30')).toBeTruthy();
  });

  it('shows an empty state with no courses, and a load failure', async () => {
    await openApp('/studio', { roles: ['educator'], studio: fakeStudio() });
    expect(await screen.findByRole('heading', { name: 'No courses yet' })).toBeTruthy();
    const broken = fakeStudio();
    broken.data.listLiveCourses = vi.fn().mockRejectedValue(new Error('offline'));
    await openApp('/studio', { roles: ['admin'], studio: broken });
    expect(await screen.findAllByText('This did not load')).not.toHaveLength(0);
  });

  async function openDialog(studio = fakeStudio({ courses: rows() })) {
    const app = await openApp('/studio', { roles: ['educator'], studio, data: fakeData() });
    fireEvent.click(await screen.findByRole('button', { name: 'New course' }));
    return { ...app, studio };
  }

  it('creates a course, deriving the address, and opens the editor', async () => {
    const { studio, router } = await openDialog();
    const dialog = screen.getByRole('dialog', { name: 'New course' });
    const create = within(dialog).getByRole('button', { name: 'Create course' });
    expect((create as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Café Basics!' } });
    expect((within(dialog).getByLabelText('Address') as HTMLInputElement).value).toBe(
      'cafe-basics',
    );
    choose(within(dialog).getByLabelText('Level'), 'Advanced');
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Sky' }));
    choose(within(dialog).getByLabelText('Duplicate from'), /^Git/);
    await act(async () => {
      fireEvent.submit(dialog.querySelector('form') as HTMLFormElement);
    });
    expect(studio.service.createCourse).toHaveBeenCalledWith({
      title: 'Café Basics!',
      slug: 'cafe-basics',
      level: 'advanced',
      theme: 'sky',
      duplicateFrom: 'git',
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/studio/courses/new-course'));
  });

  it('validates the address and shows when it is taken', async () => {
    const studio = fakeStudio({ courses: rows() });
    studio.service.createCourse = vi.fn().mockRejectedValue(apiFailure('CRS_1002'));
    await openDialog(studio);
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Git' } });
    fireEvent.change(within(dialog).getByLabelText('Address'), { target: { value: 'Bad Slug' } });
    expect(
      within(dialog).getByText('Use lower-case letters, digits and single hyphens.'),
    ).toBeTruthy();
    expect(
      (within(dialog).getByRole('button', { name: 'Create course' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('Address'), { target: { value: 'git' } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create course' }));
    });
    expect(await within(dialog).findByText('That address is taken')).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Git 2' } });
    expect(within(dialog).queryByText('That address is taken')).toBeNull();
  });

  it('shows the catalog message, or a fallback, for other failures; and cancels', async () => {
    const studio = fakeStudio({ courses: rows() });
    studio.service.createCourse = vi
      .fn()
      .mockRejectedValueOnce(apiFailure('CRS_1001'))
      .mockRejectedValueOnce(new Error('boom'));
    await openDialog(studio);
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Go' } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create course' }));
    });
    expect(await within(dialog).findByText('That course is not available yet.')).toBeTruthy();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create course' }));
    });
    expect(await within(dialog).findByText('Could not create the course. Try again.')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the dialog from the "Start a new course" card; submit does nothing while incomplete', async () => {
    await openApp('/studio', { roles: ['educator'], studio: fakeStudio({ courses: rows() }) });
    fireEvent.click(await screen.findByRole('button', { name: /Start a new course/ }));
    const dialog = screen.getByRole('dialog');
    await act(async () => {
      fireEvent.submit(dialog.querySelector('form') as HTMLFormElement);
    });
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('offers the empty-state button to create', async () => {
    await openApp('/studio', { roles: ['educator'], studio: fakeStudio() });
    await screen.findByRole('heading', { name: 'No courses yet' });
    const buttons = screen.getAllByRole('button', { name: 'New course' });
    fireEvent.click(buttons[1] as HTMLElement);
    expect(screen.getByRole('dialog', { name: 'New course' })).toBeTruthy();
  });
});
