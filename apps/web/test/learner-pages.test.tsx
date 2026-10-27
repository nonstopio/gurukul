import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ToastProvider } from '@gurukul/ui';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../src/auth/AuthProvider';
import { DataProvider } from '../src/data/DataProvider';
import type { AssignmentRow } from '../src/data/types';
import { appRoutes } from '../src/routes';
import { axeViolations } from './axe';
import { NONSTOP, fakeAuth } from './fake-auth';
import { fakeData, lesson, makeCourse, progressRow } from './fake-data';
import { isTyping } from '../src/LessonPage';

async function open(path: string, data = fakeData()) {
  const f = fakeAuth();
  const router = createMemoryRouter(appRoutes(), { initialEntries: [path] });
  const view = render(
    <AuthProvider service={f.service}>
      <DataProvider data={data.data}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </DataProvider>
    </AuthProvider>,
  );
  await act(async () => {
    f.emitUser(NONSTOP);
    await Promise.resolve();
  });
  act(() => f.emitProfile({ roles: ['shishya'], displayName: 'P', team: null }));
  return { ...view, router, ...data };
}

const assignment = (over: Partial<AssignmentRow> = {}): AssignmentRow => ({
  id: 'a1',
  courseId: 'git',
  dueAt: null,
  mandatory: true,
  status: 'assigned',
  ...over,
});

describe('Home', () => {
  it('shows the catalogue prompt when nothing is assigned or started', async () => {
    await open('/');
    expect(await screen.findByText('Nothing assigned yet')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Browse the catalogue' }).getAttribute('href')).toBe(
      '/courses',
    );
  });

  it('says courses are coming when none are published', async () => {
    await open('/', fakeData({ courses: [] }));
    expect(await screen.findByText(/once they are published/)).toBeTruthy();
  });

  it('offers to start the first assigned course that is not started', async () => {
    await open(
      '/',
      fakeData({ assignments: [assignment({ dueAt: new Date(Date.now() + 3 * 86_400_000) })] }),
    );
    expect(await screen.findByRole('heading', { name: 'Start Git, the NonStop Way' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Start course' }).getAttribute('href')).toBe(
      '/courses/git',
    );
    expect(screen.getByText('Mandatory')).toBeTruthy();
    expect(screen.getByText(/Due in 3 days|Due in 4 days/)).toBeTruthy();
  });

  it('continues the course in progress, and lists overdue and completed assignments', async () => {
    const progress = progressRow({ completedItemIds: ['l1'], lastItemId: 'l2' });
    await open(
      '/',
      fakeData({
        assignments: [
          assignment({ dueAt: new Date(Date.now() - 2 * 86_400_000), mandatory: false }),
          assignment({ id: 'a2', courseId: 'gone', status: 'completed' }),
        ],
        progress: [progress],
      }),
    );
    expect(await screen.findByRole('heading', { name: 'Git, the NonStop Way' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Resume lesson' }).getAttribute('href')).toBe(
      '/courses/git/learn/l2',
    );
    expect(screen.getByText(/Overdue by/)).toBeTruthy();
    expect(screen.queryByText('Mandatory')).toBeNull();
    expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0);
  });

  it('marks a completed assignment', async () => {
    await open(
      '/',
      fakeData({
        assignments: [assignment({ status: 'completed' })],
        progress: [progressRow({ completedAt: new Date() })],
      }),
    );
    expect(await screen.findByText('Completed')).toBeTruthy();
  });

  it('reports a load failure in an alert', async () => {
    const d = fakeData();
    d.data.listCourses = vi.fn().mockRejectedValue(new Error('offline'));
    await open('/', d);
    expect(await screen.findByText(/offline/)).toBeTruthy();
  });

  it('wraps a non-Error rejection', async () => {
    const d = fakeData();
    d.data.listCourses = vi.fn().mockRejectedValue('boom');
    await open('/', d);
    expect(await screen.findByText(/boom/)).toBeTruthy();
  });

  it('has no axe violations', async () => {
    const { container } = await open('/', fakeData({ assignments: [assignment()] }));
    await screen.findByRole('heading', { name: /Start Git/ });
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('Home with an empty course', () => {
  it('still offers a resume link for a course with no items', async () => {
    await open('/', fakeData({ courses: [makeCourse({ parvas: [] })], progress: [progressRow()] }));
    expect(
      await screen
        .findByRole('link', { name: 'Resume lesson' })
        .then((l) => l.getAttribute('href')),
    ).toBe('/courses/git/learn/');
  });
});

describe('Catalogue', () => {
  const courses = [
    makeCourse(),
    makeCourse({ id: 'sql', title: 'SQL basics', level: 'advanced', status: 'archived' }),
  ];

  it('lists courses and filters by level and "assigned to me"', async () => {
    await open('/courses', fakeData({ courses, assignments: [assignment()] }));
    expect(await screen.findByRole('link', { name: 'SQL basics' })).toBeTruthy();
    expect(screen.getByText('Retired')).toBeTruthy();
    expect(screen.getByText('Assigned')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Level'), { target: { value: 'advanced' } });
    expect(screen.queryByRole('link', { name: 'Git, the NonStop Way' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Level'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Assigned to me' }));
    expect(screen.queryByRole('link', { name: 'SQL basics' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Git, the NonStop Way' })).toBeTruthy();
  });

  it('says so when nothing matches', async () => {
    await open('/courses', fakeData({ courses }));
    await screen.findByRole('link', { name: 'SQL basics' });
    fireEvent.click(screen.getByRole('switch', { name: 'Assigned to me' }));
    expect(screen.getByText('No courses match')).toBeTruthy();
  });

  it('has no axe violations', async () => {
    const { container } = await open('/courses', fakeData({ courses }));
    await screen.findByRole('link', { name: 'SQL basics' });
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('Course overview', () => {
  it('shows the outline, starts a new course and expands a collapsed parva', async () => {
    await open('/courses/git');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Git, the NonStop Way' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Start course' }).getAttribute('href')).toBe(
      '/courses/git/learn/l1',
    );
    expect(screen.getByRole('link', { name: /Lesson l1/ })).toBeTruthy();
    expect(screen.getByText('What you will learn')).toBeTruthy();
    const toggle = screen.getByRole('button', { name: /Parva 2/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const row = screen.getByText('Pariksha I').closest('[aria-disabled]');
    expect(row?.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('Lesson l4').closest('[aria-disabled]')).toBeTruthy();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('resumes where the learner left off and shows progress, retired and no outcomes', async () => {
    const course = makeCourse({
      outcomes: [],
      status: 'archived',
      rules: { sequential: true, passMark: 0.7, certificate: false, requireVideoWatch: false },
    });
    await open(
      '/courses/git',
      fakeData({
        courses: [course],
        watched: progressRow({ completedItemIds: ['l1'], lastItemId: 'l2' }),
      }),
    );
    expect(await screen.findByRole('link', { name: 'Resume — Lesson l2' })).toBeTruthy();
    expect(screen.queryByText('What you will learn')).toBeNull();
    expect(screen.getByText(/Retired/)).toBeTruthy();
    expect(
      screen.getByRole('progressbar', { name: /progress/ }).getAttribute('aria-valuenow'),
    ).toBe('20');
  });

  it('has no resume button for a course with no items', async () => {
    await open('/courses/git', fakeData({ courses: [makeCourse({ parvas: [] })] }));
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('link', { name: /Start course|Resume/ })).toBeNull();
  });

  it('says a missing course does not exist', async () => {
    await open('/courses/nope');
    expect(await screen.findByText('This course does not exist')).toBeTruthy();
  });

  it('has no axe violations', async () => {
    const { container } = await open('/courses/git');
    await screen.findByRole('heading', { level: 1, name: 'Git, the NonStop Way' });
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('Lesson player', () => {
  const started = (over = {}) => progressRow({ lastItemId: 'l1', ...over });

  it('starts the course on first open and renders the lesson', async () => {
    const d = fakeData();
    await open('/courses/git/learn/l1', d);
    expect(await screen.findByRole('heading', { level: 1, name: 'Lesson l1' })).toBeTruthy();
    expect(screen.getByText('Body of l1')).toBeTruthy();
    await waitFor(() => expect(d.data.startCourse).toHaveBeenCalled());
  });

  it('moves the resume point when a different lesson opens', async () => {
    const d = fakeData({ watched: started() });
    await open('/courses/git/learn/l2', d);
    await screen.findByRole('heading', { level: 1, name: 'Lesson l2' });
    await waitFor(() => expect(d.data.setLastItem).toHaveBeenCalledWith('u1', 'git', 'l2'));
  });

  it('does not rewrite the resume point when it is already there', async () => {
    const d = fakeData({ watched: started() });
    await open('/courses/git/learn/l1', d);
    await screen.findByRole('heading', { level: 1, name: 'Lesson l1' });
    expect(d.data.setLastItem).not.toHaveBeenCalled();
  });

  it('marks complete, saves and moves to the next lesson', async () => {
    const d = fakeData({ watched: started() });
    const { router } = await open('/courses/git/learn/l1', d);
    fireEvent.click(await screen.findByRole('button', { name: 'Mark complete' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/courses/git/learn/l2'));
    expect(d.data.completeItem).toHaveBeenCalledWith('u1', 'git', 'l1');
  });

  it('finishes the course on the last lesson and goes back to the overview', async () => {
    const course = makeCourse({ parvas: [{ id: 'p', title: 'P', items: [lesson('only')] }] });
    const d = fakeData({ courses: [course], watched: started({ lastItemId: 'only' }) });
    const { router } = await open('/courses/git/learn/only', d);
    fireEvent.click(await screen.findByRole('button', { name: 'Finish course' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/courses/git'));
  });

  it('lets a finished lesson be revisited without saving again', async () => {
    const d = fakeData({ watched: started({ completedItemIds: ['l1'] }) });
    const { router } = await open('/courses/git/learn/l1', d);
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/courses/git/learn/l2'));
    expect(d.data.completeItem).not.toHaveBeenCalled();
  });

  it('labels the last finished lesson "Back to the course"', async () => {
    const course = makeCourse({ parvas: [{ id: 'p', title: 'P', items: [lesson('only')] }] });
    await open(
      '/courses/git/learn/only',
      fakeData({
        courses: [course],
        watched: started({ lastItemId: 'only', completedItemIds: ['only'] }),
      }),
    );
    expect(await screen.findByRole('button', { name: 'Back to the course' })).toBeTruthy();
  });

  it('keeps the page and shows a toast when saving fails', async () => {
    const d = fakeData({ watched: started() });
    d.data.completeItem = vi.fn().mockRejectedValue(new Error('offline'));
    const { router } = await open('/courses/git/learn/l1', d);
    fireEvent.click(await screen.findByRole('button', { name: 'Mark complete' }));
    expect(await screen.findByText('Could not save your progress. Try again.')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/courses/git/learn/l1');
  });

  it('waits for the "watched" toggle on a video lesson', async () => {
    const course = makeCourse({
      parvas: [
        { id: 'p', title: 'P', items: [lesson('v', { completeWhen: 'video90' }), lesson('w')] },
      ],
    });
    await open(
      '/courses/git/learn/v',
      fakeData({ courses: [course], watched: started({ lastItemId: 'v' }) }),
    );
    const button = (await screen.findByRole('button', {
      name: 'Mark complete',
    })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(screen.getByRole('switch', { name: 'I have watched the video' }));
    expect(button.disabled).toBe(false);
  });

  describe('scrolled lessons', () => {
    const course = makeCourse({
      parvas: [
        { id: 'p', title: 'P', items: [lesson('s', { completeWhen: 'scrolled' }), lesson('t')] },
      ],
    });

    it('enables completion at once where IntersectionObserver is missing', async () => {
      await open(
        '/courses/git/learn/s',
        fakeData({ courses: [course], watched: started({ lastItemId: 's' }) }),
      );
      const button = (await screen.findByRole('button', {
        name: 'Mark complete',
      })) as HTMLButtonElement;
      await waitFor(() => expect(button.disabled).toBe(false));
    });

    it('waits until the end of the lesson scrolls into view', async () => {
      let notify: (entries: Array<{ isIntersecting: boolean }>) => void = () => {};
      const disconnect = vi.fn();
      vi.stubGlobal(
        'IntersectionObserver',
        class {
          constructor(cb: typeof notify) {
            notify = cb;
          }
          observe() {}
          disconnect = disconnect;
        },
      );
      const { unmount } = await open(
        '/courses/git/learn/s',
        fakeData({ courses: [course], watched: started({ lastItemId: 's' }) }),
      );
      const button = (await screen.findByRole('button', {
        name: 'Mark complete',
      })) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      act(() => notify([{ isIntersecting: false }]));
      expect(button.disabled).toBe(true);
      act(() => notify([{ isIntersecting: true }]));
      expect(button.disabled).toBe(false);
      unmount();
      expect(disconnect).toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });

  it('shows an empty lesson plainly', async () => {
    const course = makeCourse({
      parvas: [{ id: 'p', title: 'P', items: [lesson('e', { blocks: [] })] }],
    });
    await open(
      '/courses/git/learn/e',
      fakeData({ courses: [course], watched: started({ lastItemId: 'e' }) }),
    );
    expect(await screen.findByText('This lesson is empty.')).toBeTruthy();
  });

  it('explains a locked lesson and a Pariksha instead of rendering them', async () => {
    const d = fakeData({ watched: started({ completedItemIds: ['l1', 'l2'] }) });
    const { unmount } = await open('/courses/git/learn/l4', d);
    expect(await screen.findByText('Locked for now')).toBeTruthy();
    unmount();
    await open(
      '/courses/git/learn/q1',
      fakeData({ watched: started({ completedItemIds: ['l1', 'l2', 'l3'] }) }),
    );
    expect(await screen.findByText(/open from the outline/)).toBeTruthy();
  });

  it('redirects a deleted lesson to the resume point, with a toast', async () => {
    const d = fakeData({ watched: started({ lastItemId: 'l2', completedItemIds: ['l1'] }) });
    const { router } = await open('/courses/git/learn/gone', d);
    await waitFor(() => expect(router.state.location.pathname).toBe('/courses/git/learn/l2'));
    expect(await screen.findByText(/not in this course any more/)).toBeTruthy();
  });

  it('redirects a deleted lesson in an empty course to the overview', async () => {
    const { router } = await open(
      '/courses/git/learn/gone',
      fakeData({ courses: [makeCourse({ parvas: [] })], watched: started() }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/courses/git'));
  });

  it('sends an unknown course to the catalogue', async () => {
    const { router } = await open('/courses/nope/learn/l1');
    await waitFor(() => expect(router.state.location.pathname).toBe('/courses'));
  });

  it('moves with J and K, but not while typing or with a modifier or onto a locked item', async () => {
    const d = fakeData({ watched: started({ lastItemId: 'l2', completedItemIds: ['l1'] }) });
    const { router } = await open('/courses/git/learn/l2', d);
    await screen.findByRole('heading', { level: 1, name: 'Lesson l2' });
    fireEvent.keyDown(window, { key: 'k' });
    await waitFor(() => expect(router.state.location.pathname).toBe('/courses/git/learn/l1'));
    fireEvent.keyDown(window, { key: 'j', ctrlKey: true });
    expect(router.state.location.pathname).toBe('/courses/git/learn/l1');
    fireEvent.keyDown(screen.getByRole('button', { name: 'Next' }).ownerDocument.body, {
      key: 'x',
    });
    fireEvent.keyDown(window, { key: 'j' });
    await waitFor(() => expect(router.state.location.pathname).toBe('/courses/git/learn/l2'));
    // l3 is in a parva that stays locked until l2 is done, so J does nothing.
    fireEvent.keyDown(window, { key: 'j' });
    expect(router.state.location.pathname).toBe('/courses/git/learn/l2');
  });

  it('has no axe violations', async () => {
    const { container } = await open('/courses/git/learn/l1', fakeData({ watched: started() }));
    await screen.findByRole('heading', { level: 1, name: 'Lesson l1' });
    expect(await axeViolations(container)).toEqual([]);
  });

  it('highlights the current lesson in the outline rail', async () => {
    await open('/courses/git/learn/l1', fakeData({ watched: started() }));
    const rail = await screen.findByRole('navigation', { name: 'Course outline' });
    expect(within(rail).getByRole('link', { name: 'Lesson l1' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(
      within(rail).getByRole('link', { name: 'Lesson l2' }).getAttribute('aria-current'),
    ).toBeNull();
  });
});

describe('isTyping', () => {
  it('is true inside form fields and editable content only', () => {
    expect(isTyping(document.createElement('input'))).toBe(true);
    expect(isTyping(document.createElement('textarea'))).toBe(true);
    expect(isTyping(document.createElement('button'))).toBe(false);
    expect(isTyping(null)).toBe(false);
    const div = document.createElement('div');
    Object.defineProperty(div, 'isContentEditable', { value: true });
    expect(isTyping(div)).toBe(true);
  });
});
