import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ToastProvider } from '@gurukul/ui';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../src/auth/AuthProvider';
import { ConsoleProvider } from '../src/console/ConsoleProvider';
import { DataProvider } from '../src/data/DataProvider';
import type { AssignmentRow } from '../src/data/types';
import { QuizProvider } from '../src/quiz/QuizProvider';
import { appRoutes } from '../src/routes';
import { StudioProvider } from '../src/studio/StudioProvider';
import { fakeConsole } from './fake-console';
import { fakeStudio } from './fake-studio';
import { axeViolations } from './axe';
import { NONSTOP, fakeAuth } from './fake-auth';
import { fakeData, lesson, makeCourse, progressRow } from './fake-data';
import { isTyping } from '../src/LessonPage';
import { fakeQuiz } from './fake-quiz';

async function open(
  path: string,
  data = fakeData(),
  profile: { team?: string | null; teamIds?: string[] } = {},
) {
  const f = fakeAuth();
  const router = createMemoryRouter(appRoutes(), { initialEntries: [path] });
  const view = render(
    <AuthProvider service={f.service}>
      <DataProvider data={data.data}>
        <ConsoleProvider {...fakeConsole({})}>
          <StudioProvider {...fakeStudio()}>
            <QuizProvider service={fakeQuiz()}>
              <ToastProvider>
                <RouterProvider router={router} />
              </ToastProvider>
            </QuizProvider>
          </StudioProvider>
        </ConsoleProvider>
      </DataProvider>
    </AuthProvider>,
  );
  await act(async () => {
    f.emitUser(NONSTOP);
    await Promise.resolve();
  });
  act(() =>
    f.emitProfile({
      roles: ['learner'],
      displayName: 'P',
      team: profile.team ?? null,
      teamIds: profile.teamIds,
    }),
  );
  return { ...view, router, ...data };
}

const assignment = (over: Partial<AssignmentRow> = {}): AssignmentRow => ({
  id: 'a1',
  courseId: 'git',
  dueAt: null,
  mandatory: true,
  status: 'assigned',
  assignedByName: null,
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
    expect(await screen.findByRole('heading', { name: 'Pick your next course' })).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /Start Git, the NonStop Way/ }).getAttribute('href'),
    ).toBe('/courses/git');
    expect(screen.getByText('Mandatory')).toBeTruthy();
    expect(screen.getAllByText(/Due in 3 days|Due in 4 days/).length).toBeGreaterThan(0);
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
    expect(
      (await screen.findAllByRole('heading', { name: 'Git, the NonStop Way' })).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Resume lesson' }).getAttribute('href')).toBe(
      '/courses/git/learn/l2',
    );
    expect(screen.getAllByText(/Overdue by/).length).toBeGreaterThan(0);
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

  it('marks a retired course and one that gained lessons after it was finished', async () => {
    await open(
      '/',
      fakeData({
        courses: [makeCourse({ status: 'archived' })],
        assignments: [assignment({ status: 'completed' })],
        progress: [progressRow({ completedItemIds: ['l1'], completedAt: new Date() })],
      }),
    );
    const row = (await screen.findByText('New lessons added')).closest('li') as HTMLElement;
    expect(within(row).getByText('Retired')).toBeTruthy();
    expect(within(row).getByText('Completed')).toBeTruthy();
  });

  it('marks the course to continue as retired', async () => {
    await open(
      '/',
      fakeData({
        courses: [makeCourse({ status: 'archived' })],
        progress: [progressRow({ completedItemIds: ['l1'], lastItemId: 'l2' })],
      }),
    );
    const card = (await screen.findByRole('heading', { name: 'Git, the NonStop Way' })).closest(
      'section',
    ) as HTMLElement;
    expect(within(card).getByText('Retired')).toBeTruthy();
  });

  it('reports a load failure in plain words, never the raw error, and retries', async () => {
    const d = fakeData();
    const list = d.data.listCourses;
    d.data.listCourses = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline: socket hang up'))
      .mockImplementation(list);
    await open('/', d);
    expect(await screen.findByText('Check your connection and try again.')).toBeTruthy();
    expect(screen.queryByText(/socket/)).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Namaste, Priya' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Nothing assigned yet')).toBeTruthy();
  });

  it('has no axe violations', async () => {
    const { container } = await open('/', fakeData({ assignments: [assignment()] }));
    await screen.findByRole('heading', { name: 'Pick your next course' });
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('Home handoff details', () => {
  it('shows the kicker, status line, chips, up next and recent activity', async () => {
    await open(
      '/',
      fakeData({
        assignments: [
          assignment({
            dueAt: new Date(Date.now() + 3 * 86_400_000),
            assignedByName: 'Kavya Rao',
          }),
        ],
        progress: [progressRow({ completedItemIds: ['l1'], lastItemId: 'l2' })],
      }),
    );
    expect(await screen.findByText('Learner · My learning')).toBeTruthy();
    // The kicker renders before progress loads; the status line follows it.
    expect(await screen.findByText(/You are \d+% through Git, the NonStop Way\./)).toBeTruthy();
    expect(screen.getAllByText('Foundation').length).toBe(1);
    expect(screen.getAllByText(/Due in/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Assigned by Kavya Rao/)).toBeTruthy();
    expect(screen.getByText(/Next lesson:/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Recent activity' })).toBeTruthy();
    expect(screen.getByText('Worked on Git, the NonStop Way')).toBeTruthy();
  });

  it('shows the first ten assignments and a Show all button', async () => {
    const courses = Array.from({ length: 12 }, (_, i) =>
      makeCourse({ id: `c${i}`, title: `Course ${String(i).padStart(2, '0')}` }),
    );
    const assignments = courses.map((c, i) =>
      assignment({ id: `a${i}`, courseId: c.id, mandatory: false }),
    );
    await open('/', fakeData({ courses, assignments }));
    const list = (await screen.findByRole('heading', { name: 'Assigned to you' })).closest(
      'section',
    ) as HTMLElement;
    expect(within(list).getAllByRole('listitem').length).toBe(10);
    fireEvent.click(screen.getByRole('button', { name: 'Show all 12' }));
    expect(within(list).getAllByRole('listitem').length).toBe(12);
    fireEvent.click(screen.getByRole('button', { name: 'Show fewer' }));
    expect(within(list).getAllByRole('listitem').length).toBe(10);
  });
});

describe('Home with an empty course', () => {
  it('still offers a resume link for a course with no items', async () => {
    await open(
      '/',
      fakeData({ courses: [makeCourse({ chapters: [] })], progress: [progressRow()] }),
    );
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

  it('lists courses with their visibility, and filters by level and view', async () => {
    await open('/courses', fakeData({ courses, assignments: [assignment()] }));
    expect(await screen.findByRole('link', { name: 'SQL basics' })).toBeTruthy();
    expect(screen.getByText('Retired')).toBeTruthy();
    expect(screen.getByText('Assigned')).toBeTruthy();
    expect(screen.getAllByText('Public').length).toBe(2);
    fireEvent.change(screen.getByLabelText('Level'), { target: { value: 'advanced' } });
    expect(screen.queryByRole('link', { name: 'Git, the NonStop Way' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Level'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Assigned to me' }));
    expect(screen.queryByRole('link', { name: 'SQL basics' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Git, the NonStop Way' })).toBeTruthy();
  });

  it('searches, sorts and holds the filters in the URL', async () => {
    const { router } = await open('/courses', fakeData({ courses }));
    await screen.findByRole('link', { name: 'SQL basics' });
    fireEvent.change(screen.getByLabelText('Search courses'), { target: { value: 'sql' } });
    expect(router.state.location.search).toBe('?q=sql');
    expect(screen.queryByRole('link', { name: 'Git, the NonStop Way' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Search courses'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'title' } });
    expect(router.state.location.search).toBe('?sort=title');
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titles).toEqual(['Git, the NonStop Way', 'SQL basics']);
  });

  it('starts from the filters in the URL, and filters by progress', async () => {
    const done = progressRow({ courseId: 'sql', completedAt: new Date() });
    const going = progressRow({ courseId: 'git', completedItemIds: ['l1'] });
    await open('/courses?show=completed', fakeData({ courses, progress: [done, going] }));
    expect(await screen.findByRole('link', { name: 'SQL basics' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Git, the NonStop Way' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'In progress' }));
    expect(screen.getByRole('link', { name: 'Git, the NonStop Way' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'SQL basics' })).toBeNull();
  });

  it('shows only the courses the person may open', async () => {
    const mixed = [
      { ...makeCourse(), visibility: 'public' as const, visibleTeamIds: [] },
      {
        ...makeCourse({ id: 'ops', title: 'Ops only' }),
        visibility: 'teams' as const,
        visibleTeamIds: ['ops'],
      },
      {
        ...makeCourse({ id: 'mine', title: 'Platform only' }),
        visibility: 'teams' as const,
        visibleTeamIds: ['platform'],
      },
      {
        ...makeCourse({ id: 'staff', title: 'Staff only' }),
        visibility: 'staff' as const,
        visibleTeamIds: [],
      },
    ];
    const data = fakeData({ courses: mixed });
    await open('/courses', data, { team: null, teamIds: ['platform'] });
    expect(await screen.findByRole('link', { name: 'Platform only' })).toBeTruthy();
    expect(screen.getByText('Team only')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Ops only' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Staff only' })).toBeNull();
    expect(data.data.listCourses).toHaveBeenCalledWith({ teamIds: ['platform'], staff: false });
  });

  it('shows the filters that are on as chips, and removes each one', async () => {
    const { router } = await open('/courses?show=progress&level=foundation', fakeData({ courses }));
    const search = await screen.findByRole('search', { name: 'Find a course' });
    expect(within(search).getByText('Level: Foundation')).toBeTruthy();
    fireEvent.click(
      within(search).getByRole('button', { name: 'Remove filter: Level: Foundation' }),
    );
    expect(router.state.location.search).not.toContain('level');
    fireEvent.click(within(search).getByRole('button', { name: /^Remove filter: / }));
    expect(router.state.location.search).not.toContain('show');
  });

  it('says so when nothing matches, and clears all filters', async () => {
    const { router } = await open('/courses?show=assigned', fakeData({ courses }));
    expect(await screen.findByText('No courses match')).toBeTruthy();
    const filters = screen.getByRole('search', { name: 'Find a course' });
    expect(within(filters).getByRole('status').textContent).toBe('0 of 2 courses');
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear all filters' })[0] as HTMLElement);
    expect(router.state.location.search).toBe('');
    expect(screen.getByRole('link', { name: 'SQL basics' })).toBeTruthy();
    expect(within(filters).getByRole('status').textContent).toBe('2 of 2 courses');
    expect(within(filters).queryByRole('button', { name: 'Clear all filters' })).toBeNull();
  });

  it('says when no course is published yet', async () => {
    await open('/courses', fakeData({ courses: [] }));
    expect(await screen.findByRole('heading', { name: 'No courses to show yet' })).toBeTruthy();
  });

  it('has no axe violations', async () => {
    const { container } = await open('/courses', fakeData({ courses }));
    await screen.findByRole('link', { name: 'SQL basics' });
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('Course overview', () => {
  it('shows when the course is due in the hero band', async () => {
    await open(
      '/courses/git',
      fakeData({ assignments: [assignment({ dueAt: new Date(Date.now() + 3 * 86_400_000) })] }),
    );
    expect(await screen.findByText('Due in 3 days')).toBeTruthy();
  });

  it('flags an overdue course in the hero band', async () => {
    await open(
      '/courses/git',
      fakeData({ assignments: [assignment({ dueAt: new Date(Date.now() - 2 * 86_400_000) })] }),
    );
    expect(await screen.findByText('Overdue by 2 days')).toBeTruthy();
  });

  it('opens without a due date when assignments fail to load', async () => {
    const d = fakeData();
    d.data.myAssignments = vi.fn().mockRejectedValue(new Error('offline'));
    await open('/courses/git', d);
    expect(await screen.findByRole('link', { name: 'Start course' })).toBeTruthy();
    expect(screen.queryByText(/^Due /)).toBeNull();
  });

  it('shows the outline, starts a new course and expands a collapsed chapter', async () => {
    await open('/courses/git');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Git, the NonStop Way' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Start course' }).getAttribute('href')).toBe(
      '/courses/git/learn/l1',
    );
    expect(screen.getByRole('link', { name: /Lesson l1/ })).toBeTruthy();
    expect(screen.getByText('What you will learn')).toBeTruthy();
    const toggle = screen.getByRole('button', { name: /Chapter 2/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const row = screen.getByText('Quiz I').closest('[aria-disabled]');
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
    expect(screen.getByText('This course is retired')).toBeTruthy();
    expect(screen.queryByText('New lessons added')).toBeNull();
    expect(
      screen.getByRole('progressbar', { name: /progress/ }).getAttribute('aria-valuenow'),
    ).toBe('20');
  });

  it('renders the description, names the Educators and explains a locked row', async () => {
    localStorage.clear();
    const course = makeCourse({
      description: 'Learn **Git** properly.',
      educatorIds: ['a1', 'a2'],
      educatorNames: { a1: 'Asha Rao', a2: 'Dev Nair' },
    });
    await open('/courses/git', fakeData({ courses: [course] }));
    expect((await screen.findByText('Git')).tagName).toBe('STRONG');
    expect(screen.getByRole('heading', { name: 'Your Educators' })).toBeTruthy();
    expect(screen.getByText('Asha Rao')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Chapter 2/ }));
    expect(screen.getByText('Lesson l4').closest('[aria-disabled]')?.getAttribute('title')).toBe(
      'Pass Quiz I to unlock',
    );
    expect(screen.getByText('Quiz I').closest('[aria-disabled]')?.getAttribute('title')).toBe(
      'Finish the earlier lessons to unlock',
    );
  });

  it('names a single Educator, hides a repeated description and remembers open chapters', async () => {
    localStorage.clear();
    const course = makeCourse({
      description: 'Version control for teams.',
      educatorNames: { a1: 'Asha Rao' },
    });
    const first = await open('/courses/git', fakeData({ courses: [course] }));
    expect(await screen.findByRole('heading', { name: 'Your Educator' })).toBeTruthy();
    expect(document.querySelector('.prose')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Chapter 2/ }));
    first.unmount();
    await open('/courses/git', fakeData({ courses: [course] }));
    const toggle = await screen.findByRole('button', { name: /Chapter 2/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    localStorage.clear();
  });

  it('links to the certificate once one is issued', async () => {
    await open(
      '/courses/git',
      fakeData({
        watched: progressRow({ completedAt: new Date(), certificateId: 'NSG-GIT-26-0001' }),
      }),
    );
    expect(
      (await screen.findByRole('link', { name: 'View your certificate' })).getAttribute('href'),
    ).toBe('/certificates/NSG-GIT-26-0001');
  });

  it('says lessons were added to a course the learner finished', async () => {
    await open(
      '/courses/git',
      fakeData({ watched: progressRow({ completedItemIds: ['l1'], completedAt: new Date() }) }),
    );
    expect(await screen.findByText('New lessons added')).toBeTruthy();
    expect(screen.queryByText('This course is retired')).toBeNull();
  });

  it('has no resume button for a course with no items', async () => {
    await open('/courses/git', fakeData({ courses: [makeCourse({ chapters: [] })] }));
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('link', { name: /Start course|Resume/ })).toBeNull();
  });

  it('says a missing course does not exist', async () => {
    await open('/courses/nope');
    expect(await screen.findByText('This course does not exist')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Course not found' })).toBeTruthy();
  });

  it('does not ask a learner with no team to pick one', async () => {
    await open('/', fakeData({ teams: ['QA'] }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Namaste, Priya' })).toBeTruthy();
    expect(screen.queryByText('Which team are you in?')).toBeNull();
  });

  it('shows a page-shaped skeleton, then a plain warning with Retry when the course fails', async () => {
    const d = fakeData();
    const get = d.data.getCourse;
    let fail: (e: Error) => void = () => {};
    d.data.getCourse = vi
      .fn()
      .mockReturnValueOnce(new Promise((_, reject) => (fail = reject)))
      .mockImplementation(get);
    await open('/courses/git', d);
    expect(screen.getByText('Loading')).toBeTruthy();
    await act(async () => fail(new Error('unavailable: deadline exceeded')));
    expect(await screen.findByText('This did not load')).toBeTruthy();
    expect(screen.queryByText(/deadline/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Git, the NonStop Way' }),
    ).toBeTruthy();
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
    expect(await screen.findByRole('heading', { level: 1, name: /^Lesson l1/ })).toBeTruthy();
    expect(screen.getByText('Body of l1')).toBeTruthy();
    await waitFor(() => expect(d.data.startCourse).toHaveBeenCalled());
  });

  it('says a retired course keeps its lessons open but cannot be finished', async () => {
    await open(
      '/courses/git/learn/l1',
      fakeData({ courses: [makeCourse({ status: 'archived' })], watched: started() }),
    );
    expect(await screen.findByText('This course is retired')).toBeTruthy();
    expect(screen.getByText('Body of l1')).toBeTruthy();
  });

  it('moves the resume point when a different lesson opens', async () => {
    const d = fakeData({ watched: started() });
    await open('/courses/git/learn/l2', d);
    await screen.findByRole('heading', { level: 1, name: /^Lesson l2/ });
    await waitFor(() => expect(d.data.setLastItem).toHaveBeenCalledWith('u1', 'git', 'l2'));
  });

  it('does not rewrite the resume point when it is already there', async () => {
    const d = fakeData({ watched: started() });
    await open('/courses/git/learn/l1', d);
    await screen.findByRole('heading', { level: 1, name: /^Lesson l1/ });
    expect(d.data.setLastItem).not.toHaveBeenCalled();
  });

  it('marks complete, saves and moves to the next lesson', async () => {
    const d = fakeData({ watched: started() });
    const { router } = await open('/courses/git/learn/l1', d);
    fireEvent.click(await screen.findByRole('button', { name: /^Mark complete/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/courses/git/learn/l2'));
    expect(d.data.completeItem).toHaveBeenCalledWith('u1', 'git', 'l1');
  });

  it('creates the progress document before saving when the course was not started yet', async () => {
    const d = fakeData();
    await open('/courses/git/learn/l1', d);
    fireEvent.click(await screen.findByRole('button', { name: /^Mark complete/ }));
    await waitFor(() => expect(d.data.completeItem).toHaveBeenCalledWith('u1', 'git', 'l1'));
    const started = d.data.startCourse as ReturnType<typeof vi.fn>;
    const saved = d.data.completeItem as ReturnType<typeof vi.fn>;
    expect(Math.min(...started.mock.invocationCallOrder)).toBeLessThan(
      saved.mock.invocationCallOrder[0] as number,
    );
  });

  it('finishes the course on the last lesson and opens the completion screen', async () => {
    const course = makeCourse({ chapters: [{ id: 'p', title: 'P', items: [lesson('only')] }] });
    const d = fakeData({ courses: [course], watched: started({ lastItemId: 'only' }) });
    const { router } = await open('/courses/git/learn/only', d);
    fireEvent.click(await screen.findByRole('button', { name: 'Finish course' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/courses/git/complete'));
  });

  it('lets a finished lesson be revisited without saving again', async () => {
    const d = fakeData({ watched: started({ completedItemIds: ['l1'] }) });
    const { router } = await open('/courses/git/learn/l1', d);
    fireEvent.click(await screen.findByRole('button', { name: /^Next/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/courses/git/learn/l2'));
    expect(d.data.completeItem).not.toHaveBeenCalled();
  });

  it('labels the last finished lesson "Back to the course"', async () => {
    const course = makeCourse({ chapters: [{ id: 'p', title: 'P', items: [lesson('only')] }] });
    await open(
      '/courses/git/learn/only',
      fakeData({
        courses: [course],
        watched: started({ lastItemId: 'only', completedItemIds: ['only'] }),
      }),
    );
    expect(await screen.findByRole('button', { name: 'Back to the course' })).toBeTruthy();
  });

  it('moves on without waiting for the server, so it works offline', async () => {
    const d = fakeData({ watched: started() });
    d.data.completeItem = vi.fn(() => new Promise<void>(() => {}));
    const { router } = await open('/courses/git/learn/l1', d);
    fireEvent.click(await screen.findByRole('button', { name: /^Mark complete/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/courses/git/learn/l2'));
  });

  it('names the lesson in a toast when the server refuses the write', async () => {
    const d = fakeData({ watched: started() });
    d.data.completeItem = vi.fn().mockRejectedValue(new Error('permission-denied'));
    await open('/courses/git/learn/l1', d);
    fireEvent.click(await screen.findByRole('button', { name: /^Mark complete/ }));
    expect(
      await screen.findByText(
        'Could not save your progress on "Lesson l1". Open it and try again.',
      ),
    ).toBeTruthy();
  });

  describe('check questions', () => {
    const check = (id: string) => ({
      type: 'check' as const,
      id,
      prompt: `Question ${id}?`,
      options: ['Yes', 'No'],
      correct: 0,
      explanation: `Because ${id}`,
    });
    const openWith = (blocks: object[]) =>
      open(
        '/courses/git/learn/c',
        fakeData({
          courses: [
            makeCourse({
              chapters: [
                { id: 'p', title: 'P', items: [lesson('c', { blocks }), lesson('d')] as never },
              ],
            }),
          ],
          watched: started({ lastItemId: 'c' }),
        }),
      );

    it('asks for the answer in a toast until it has been shown, then moves on', async () => {
      const { router } = await openWith([check('k')]);
      const why = 'Answer the question in this lesson to mark it complete.';
      fireEvent.click(await screen.findByRole('button', { name: /^Mark complete/ }));
      await waitFor(() => expect(screen.getAllByText(why)).toHaveLength(2));
      expect(router.state.location.pathname).toBe('/courses/git/learn/c');
      fireEvent.click(screen.getByText('Yes'));
      fireEvent.click(screen.getByRole('button', { name: /^Mark complete/ }));
      await waitFor(() => expect(router.state.location.pathname).toBe('/courses/git/learn/d'));
    });

    it('counts the questions left when there are several', async () => {
      await openWith([check('k'), check('m')]);
      expect(
        await screen.findByText('Answer the 2 questions in this lesson to mark it complete.'),
      ).toBeTruthy();
    });
  });

  describe('a locked next item', () => {
    it('names the unfinished lesson in a toast instead of opening a locked one', async () => {
      const d = fakeData({ watched: started({ lastItemId: 'l2' }) });
      const { router } = await open('/courses/git/learn/l2', d);
      fireEvent.click(await screen.findByRole('button', { name: /^Mark complete/ }));
      expect(await screen.findByText('Finish "Lesson l1" to open the next lesson.')).toBeTruthy();
      expect(d.data.completeItem).toHaveBeenCalledWith('u1', 'git', 'l2');
      expect(router.state.location.pathname).toBe('/courses/git/learn/l2');
    });

    it('names the Quiz to pass when one stands in the way', async () => {
      const quiz = makeCourse().chapters[1]?.items[1];
      const course = makeCourse({
        chapters: [
          {
            id: 'p',
            title: 'P',
            items: [lesson('a'), quiz, lesson('b'), lesson('c')] as never,
          },
        ],
      });
      await open(
        '/courses/git/learn/b',
        fakeData({
          courses: [course],
          watched: started({ lastItemId: 'b', completedItemIds: ['a', 'b'] }),
        }),
      );
      fireEvent.click(await screen.findByRole('button', { name: /^Next/ }));
      expect(
        await screen.findByText('Pass the Quiz "Quiz I" to open the next lesson.'),
      ).toBeTruthy();
    });
  });

  describe('video lessons', () => {
    const drive = {
      type: 'video' as const,
      id: 'vid',
      provider: 'drive' as const,
      url: 'https://drive.google.com/file/d/f1/view',
      captions: false,
    };
    const openWith = (items: object[], requireVideoWatch = false) =>
      open(
        '/courses/git/learn/v',
        fakeData({
          courses: [
            makeCourse({
              chapters: [{ id: 'p', title: 'P', items: items as never }],
              rules: { sequential: true, passMark: 0.7, certificate: true, requireVideoWatch },
            }),
          ],
          watched: started({ lastItemId: 'v' }),
        }),
      );
    const markComplete = async () =>
      (await screen.findByRole('button', { name: /^Mark complete/ })) as HTMLButtonElement;

    it('waits for the video on a video90 lesson, and a press says why in a toast', async () => {
      const { router } = await openWith([
        lesson('v', { completeWhen: 'video90', blocks: [drive] }),
        lesson('w'),
      ]);
      const button = await markComplete();
      const why = 'Watch 90% of the video to mark this lesson complete.';
      expect(
        document.getElementById(button.getAttribute('aria-describedby') ?? '')?.textContent,
      ).toBe(why);
      fireEvent.click(button);
      await waitFor(() => expect(screen.getAllByText(why)).toHaveLength(2));
      expect(router.state.location.pathname).toBe('/courses/git/learn/v');
      fireEvent.click(screen.getByRole('switch', { name: 'I have watched the video' }));
      expect(button.getAttribute('aria-describedby')).toBeNull();
      fireEvent.click(button);
      await waitFor(() => expect(router.state.location.pathname).toBe('/courses/git/learn/w'));
    });

    it('renders a split lesson as one column, like every other layout', async () => {
      const split = await openWith([
        lesson('v', { layout: 'split', blocks: [drive] }),
        lesson('w'),
      ]);
      await screen.findByRole('heading', { level: 1 });
      expect(split.container.querySelector('.article__media')).toBeNull();
    });

    it('waits for the video on any lesson when the course requires watching', async () => {
      await openWith([lesson('v', { blocks: [drive] }), lesson('w')], true);
      expect((await markComplete()).getAttribute('aria-describedby')).toBe('complete-hint');
    });

    it('does not wait when nothing asks for it, or there is no video', async () => {
      const first = await openWith([lesson('v', { blocks: [drive] }), lesson('w')]);
      expect((await markComplete()).getAttribute('aria-describedby')).toBeNull();
      expect(screen.queryByRole('switch')).toBeNull();
      first.unmount();
      await openWith([lesson('v', { completeWhen: 'video90' }), lesson('w')]);
      expect((await markComplete()).getAttribute('aria-describedby')).toBeNull();
    });
  });

  describe('scrolled lessons', () => {
    const course = makeCourse({
      chapters: [
        { id: 'p', title: 'P', items: [lesson('s', { completeWhen: 'scrolled' }), lesson('t')] },
      ],
    });

    it('enables completion at once where IntersectionObserver is missing', async () => {
      await open(
        '/courses/git/learn/s',
        fakeData({ courses: [course], watched: started({ lastItemId: 's' }) }),
      );
      const button = (await screen.findByRole('button', {
        name: /^Mark complete/,
      })) as HTMLButtonElement;
      await waitFor(() => expect(button.getAttribute('aria-describedby')).toBeNull());
    });

    it('waits until the end of the lesson scrolls into view', async () => {
      let notify: (entries: Array<{ isIntersecting: boolean }>) => void = () => {};
      const observe = vi.fn();
      const disconnect = vi.fn();
      vi.stubGlobal(
        'IntersectionObserver',
        class {
          constructor(cb: typeof notify) {
            notify = cb;
          }
          observe = observe;
          disconnect = disconnect;
        },
      );
      const { unmount } = await open(
        '/courses/git/learn/s',
        fakeData({ courses: [course], watched: started({ lastItemId: 's' }) }),
      );
      const button = (await screen.findByRole('button', {
        name: /^Mark complete/,
      })) as HTMLButtonElement;
      expect(button.getAttribute('aria-describedby')).toBe('complete-hint');
      // The observer starts in an effect that can run after the button is on screen; a notify
      // before then would reach nobody.
      await waitFor(() => expect(observe).toHaveBeenCalled());
      act(() => notify([{ isIntersecting: false }]));
      expect(button.getAttribute('aria-describedby')).toBe('complete-hint');
      act(() => notify([{ isIntersecting: true }]));
      expect(button.getAttribute('aria-describedby')).toBeNull();
      unmount();
      expect(disconnect).toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });

  it('shows an empty lesson plainly', async () => {
    const course = makeCourse({
      chapters: [{ id: 'p', title: 'P', items: [lesson('e', { blocks: [] })] }],
    });
    await open(
      '/courses/git/learn/e',
      fakeData({ courses: [course], watched: started({ lastItemId: 'e' }) }),
    );
    expect(await screen.findByText('This lesson is empty.')).toBeTruthy();
  });

  it('explains a locked lesson, and sends a Quiz to its own screen', async () => {
    const d = fakeData({ watched: started({ completedItemIds: ['l1', 'l2'] }) });
    const { unmount } = await open('/courses/git/learn/l4', d);
    expect(await screen.findByText('Locked for now')).toBeTruthy();
    unmount();
    const { router } = await open(
      '/courses/git/learn/q1',
      fakeData({ watched: started({ completedItemIds: ['l1', 'l2', 'l3'] }) }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/courses/git/quiz/q1'));
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
      fakeData({ courses: [makeCourse({ chapters: [] })], watched: started() }),
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
    await screen.findByRole('heading', { level: 1, name: /^Lesson l2/ });
    fireEvent.keyDown(window, { key: 'k' });
    await waitFor(() => expect(router.state.location.pathname).toBe('/courses/git/learn/l1'));
    fireEvent.keyDown(window, { key: 'j', ctrlKey: true });
    expect(router.state.location.pathname).toBe('/courses/git/learn/l1');
    fireEvent.keyDown(screen.getByRole('button', { name: /^Next/ }).ownerDocument.body, {
      key: 'x',
    });
    fireEvent.keyDown(window, { key: 'j' });
    await waitFor(() => expect(router.state.location.pathname).toBe('/courses/git/learn/l2'));
    // l3 is in a chapter that stays locked until l2 is done, so J does nothing.
    fireEvent.keyDown(window, { key: 'j' });
    expect(router.state.location.pathname).toBe('/courses/git/learn/l2');
  });

  it('has no axe violations', async () => {
    const { container } = await open('/courses/git/learn/l1', fakeData({ watched: started() }));
    await screen.findByRole('heading', { level: 1, name: /^Lesson l1/ });
    expect(await axeViolations(container)).toEqual([]);
  });

  it('groups the rail by chapter, open only on the current one, with state words', async () => {
    await open('/courses/git/learn/l1', fakeData({ watched: started() }));
    const rail = await screen.findByRole('navigation', { name: 'Course outline' });
    const heads = within(rail).getAllByRole('button');
    expect(heads.map((h) => h.getAttribute('aria-expanded'))).toEqual(['true', 'false']);
    expect(within(rail).queryByRole('link', { name: /^Lesson l3/ })).toBeNull();
    expect(within(rail).getAllByText('(Locked)', { exact: false })).toBeTruthy();
    fireEvent.click(heads[1] as HTMLElement);
    expect(heads[1]?.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(heads[0] as HTMLElement);
    expect(heads[0]?.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows the chapter kicker, type and duration chips and the neighbours in the footer', async () => {
    await open('/courses/git/learn/l1', fakeData({ watched: started() }));
    expect(await screen.findByText('Chapter 1 · Lesson 1 of 2')).toBeTruthy();
    expect(screen.getByText('5 min')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mark complete · Lesson l2' })).toBeTruthy();
  });

  it('shows a type chip when the lesson has a kind label', async () => {
    const course = makeCourse({
      chapters: [{ id: 'p', title: 'P', items: [{ ...lesson('only'), kindLabel: 'Hands-on' }] }],
    });
    await open(
      '/courses/git/learn/only',
      fakeData({ courses: [course], watched: started({ lastItemId: 'only' }) }),
    );
    expect(await screen.findByText('Hands-on')).toBeTruthy();
  });

  it('highlights the current lesson in the outline rail', async () => {
    await open('/courses/git/learn/l1', fakeData({ watched: started() }));
    const rail = await screen.findByRole('navigation', { name: 'Course outline' });
    expect(
      within(rail)
        .getByRole('link', { name: /^Lesson l1/ })
        .getAttribute('aria-current'),
    ).toBe('page');
    expect(
      within(rail)
        .getByRole('link', { name: /^Lesson l2/ })
        .getAttribute('aria-current'),
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
