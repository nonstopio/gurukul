import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axeViolations } from './axe';
import { fakeData, lesson, makeCourse } from './fake-data';
import { draftDoc, fakeStudio } from './fake-studio';
import { openApp } from './harness';
import { apiFailure } from './studio-fixtures';

vi.mock('../src/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

function rows() {
  const live = makeCourse({ id: 'git', title: 'Git', acharyaIds: ['u1'], version: 2 });
  const edited = makeCourse({
    id: 'git',
    title: 'Git',
    acharyaIds: ['u1'],
    version: 2,
    parvas: [{ id: 'p1', title: 'Basics', items: [lesson('l1', { title: 'Changed' })] }],
  });
  const draftOnly = makeCourse({
    id: 'new',
    title: 'Brand new',
    status: 'draft',
    version: 0,
    acharyaIds: ['u1'],
  });
  const one = makeCourse({
    id: 'one',
    title: 'One edit',
    acharyaIds: ['u1'],
    parvas: [{ id: 'p1', title: 'Basics', items: [lesson('l1')] }],
  });
  const oneDraft = makeCourse({
    ...one,
    title: 'One edit',
    parvas: one.parvas,
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
        acharyaIds: ['x'],
        acharyaNames: { x: 'Rohan Das' },
      }),
      draft: null,
    },
    {
      live: makeCourse({ id: 'old', title: 'Retired', status: 'archived', acharyaIds: ['x'] }),
      draft: null,
    },
  ];
}

describe('Studio courses page', () => {
  it('lists courses with status, edits and view-only cards', async () => {
    const studio = fakeStudio({ courses: rows() });
    await openApp('/studio', { roles: ['acharya'], studio });
    expect(await screen.findByRole('heading', { name: 'Courses' })).toBeTruthy();
    expect(screen.getByText(/parva by parva/)).toBeTruthy();
    expect(studio.data.listCourses).toHaveBeenCalledWith('u1', false);
    expect(await screen.findByRole('tab', { name: 'All (5)' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Published (3)' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Drafts (1)' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Git' }).getAttribute('href')).toBe(
      '/studio/courses/git',
    );
    expect(screen.getByText(/^\d+ unpublished edits$/)).toBeTruthy();
    expect(screen.getByText('1 unpublished edit')).toBeTruthy();
    expect(screen.getByText('Edited 2 h ago')).toBeTruthy();
    expect(screen.getByText('Edited just now')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Not mine' })).toBeNull();
    expect(screen.getByText('View only — Acharya: Rohan Das')).toBeTruthy();
    expect(screen.getByText('View only')).toBeTruthy();
    expect(screen.getByText('Archived')).toBeTruthy();
    expect(screen.getByText('Published · v2')).toBeTruthy();
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('filters by tab and explains an empty tab', async () => {
    const studio = fakeStudio({ courses: [rows()[0] as never] });
    await openApp('/studio', { roles: ['acharya'], studio });
    fireEvent.click(await screen.findByRole('tab', { name: 'Drafts (0)' }));
    expect(screen.getByRole('heading', { name: 'No drafts' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Published (1)' }));
    expect(screen.getByRole('link', { name: 'Git' })).toBeTruthy();
  });

  it('shows an empty state with no courses, and a load failure', async () => {
    await openApp('/studio', { roles: ['acharya'], studio: fakeStudio() });
    expect(await screen.findByRole('heading', { name: 'No courses yet' })).toBeTruthy();
    const broken = fakeStudio();
    broken.data.listCourses = vi.fn().mockRejectedValue(new Error('offline'));
    await openApp('/studio', { roles: ['kulapati'], studio: broken });
    expect(await screen.findAllByText('This did not load')).not.toHaveLength(0);
    expect(broken.data.listCourses).toHaveBeenCalledWith('u1', true);
  });

  async function openDialog(studio = fakeStudio({ courses: rows() })) {
    const app = await openApp('/studio', { roles: ['acharya'], studio, data: fakeData() });
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
    fireEvent.change(within(dialog).getByLabelText('Level'), { target: { value: 'advanced' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Sky' }));
    fireEvent.change(within(dialog).getByLabelText('Duplicate from'), { target: { value: 'git' } });
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
    await openApp('/studio', { roles: ['acharya'], studio: fakeStudio({ courses: rows() }) });
    fireEvent.click(await screen.findByRole('button', { name: /Start a new course/ }));
    const dialog = screen.getByRole('dialog');
    await act(async () => {
      fireEvent.submit(dialog.querySelector('form') as HTMLFormElement);
    });
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('offers the empty-state button to create', async () => {
    await openApp('/studio', { roles: ['acharya'], studio: fakeStudio() });
    await screen.findByRole('heading', { name: 'No courses yet' });
    const buttons = screen.getAllByRole('button', { name: 'New course' });
    fireEvent.click(buttons[1] as HTMLElement);
    expect(screen.getByRole('dialog', { name: 'New course' })).toBeTruthy();
  });
});
