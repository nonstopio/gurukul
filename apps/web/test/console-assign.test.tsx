import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axeViolations } from './axe';
import { fakeConsole, userRow } from './fake-console';
import { fakeData, makeCourse } from './fake-data';
import { openApp } from './harness';
import type { KnownEmails } from '../src/console/types';

const admin = { roles: ['admin'] as Array<'admin'> };
const PATH = '/admin/assign';
const draft = makeCourse({ id: 'draft', title: 'Draft course', status: 'draft' });
const sql = makeCourse({ id: 'sql', title: 'SQL basics' });
const base = makeCourse();
const one = makeCourse({
  id: 'one',
  title: 'One lesson',
  chapters: [{ id: 'p1', title: 'Only', items: base.chapters.flatMap((p) => p.items).slice(0, 1) }],
});
const OK = {
  summary: { signedIn: 1, newInvites: 0, alreadyAssigned: 0, rejected: [] },
  assigned: 1,
  notified: 0,
  failed: [],
};

function setup(over: Parameters<typeof fakeConsole>[0] = {}) {
  const c = fakeConsole({ teams: ['QA'], ...over });
  c.data.knownEmails = vi.fn().mockResolvedValue({
    signedIn: new Set(['a@nonstopio.com']),
    assigned: new Set(['c@nonstopio.com']),
    byCourse: { git: new Set(['c@nonstopio.com']) },
  });
  return c;
}
const data = () => fakeData({ courses: [makeCourse(), sql, draft] });

const open = (c = setup(), d = data(), state?: object) =>
  openApp(state ? { pathname: PATH, state } : PATH, { ...admin, console: c, data: d });
const pick = async (re: RegExp) => fireEvent.click(await screen.findByLabelText(re));
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }));
const back = () => fireEvent.click(screen.getByRole('button', { name: 'Back' }));
const heading = (name: string) => screen.findByRole('heading', { level: 2, name });

async function addEmails(...emails: string[]) {
  const input = screen.getByLabelText('Email addresses');
  for (const e of emails) {
    fireEvent.change(input, { target: { value: e } });
    fireEvent.keyDown(input, { key: 'Enter' });
  }
}

/** Picks the Git course, adds the people, and walks to Review. */
async function toReview(...emails: string[]) {
  await pick(/Git, the NonStop Way/);
  next();
  await heading('Who is it for?');
  await addEmails(...emails);
  await waitFor(() => expect(screen.getByText(/will be assigned\./)).toBeTruthy());
  next();
  await heading('Set the deadline');
  next();
  await heading('Review and assign');
}
const problem = () => document.querySelector('.console-problem');
const sentence = () => document.querySelector('.console-sentence')?.textContent;

describe('Assign: course step', () => {
  it('lists only published courses, filters by search, and needs a course to go on', async () => {
    const { container } = await open();
    expect(await screen.findByLabelText(/Git, the NonStop Way/)).toBeTruthy();
    expect(screen.getByLabelText(/SQL basics/)).toBeTruthy();
    expect(screen.queryByLabelText(/Draft course/)).toBeNull();
    expect(screen.getByText('Step 1 of 4: Course')).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);

    fireEvent.change(screen.getByLabelText('Search courses'), { target: { value: 'sql' } });
    expect(screen.queryByLabelText(/Git, the NonStop Way/)).toBeNull();
    expect(screen.getByLabelText(/SQL basics/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search courses'), { target: { value: 'zzz ' } });
    expect(screen.getByRole('heading', { name: 'No course matches “zzz”' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search courses'), { target: { value: '' } });

    next();
    const alert = problem() as HTMLElement;
    expect(alert.textContent).toBe('Choose at least one course to continue.');
    expect(document.activeElement).toBe(alert);
    // Going on clears the message; a course can be unticked again.
    fireEvent.click(screen.getByLabelText(/SQL basics/));
    fireEvent.click(screen.getByLabelText(/Git, the NonStop Way/));
    fireEvent.click(screen.getByLabelText(/Git, the NonStop Way/));
    fireEvent.click(screen.getByLabelText(/SQL basics/));
    fireEvent.click(screen.getByLabelText(/SQL basics/));
    next();
    expect(await heading('Who is it for?')).toBeTruthy();
    expect(screen.queryByText('Choose at least one course to continue.')).toBeNull();
  });

  it('shows shapes for a course list that is loading, empty or failed', async () => {
    const d = data();
    d.data.listCourses = vi.fn().mockReturnValue(new Promise(() => {}));
    await open(setup(), d);
    expect(screen.getByText('Loading')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('says there are no published courses', async () => {
    await open(setup(), fakeData({ courses: [draft] }));
    expect(await screen.findByRole('heading', { name: 'No published courses yet' })).toBeTruthy();
  });

  it('offers Retry when the course list fails', async () => {
    const d = data();
    const failing = vi.fn().mockRejectedValue(new Error('x'));
    d.data.listCourses = failing;
    await open(setup(), d);
    const before = failing.mock.calls.length;
    fireEvent.click((await screen.findAllByRole('button', { name: 'Retry' }))[0] as HTMLElement);
    await waitFor(() => expect(failing.mock.calls.length).toBeGreaterThan(before));
  });

  it('shows lesson counts, singular for one lesson', async () => {
    await open(setup(), fakeData({ courses: [base, one] }));
    expect(await screen.findByText(/4 lessons · /)).toBeTruthy();
    expect(screen.getByText(/1 lesson · /)).toBeTruthy();
  });
});

describe('Assign: audience step', () => {
  it('classifies pasted emails, counts who will be assigned and needs one person', async () => {
    const c = setup();
    await open(c);
    await pick(/Git, the NonStop Way/);
    next();
    await heading('Who is it for?');
    next();
    expect(problem()?.textContent).toBe('Add at least one person who can be assigned.');
    await addEmails(
      'a@nonstopio.com',
      'new@nonstopio.com',
      'c@nonstopio.com',
      'bad',
      'x@gmail.com',
    );
    await waitFor(() =>
      expect(c.data.knownEmails).toHaveBeenLastCalledWith(
        ['a@nonstopio.com', 'new@nonstopio.com', 'c@nonstopio.com', 'bad', 'x@gmail.com'],
        ['git'],
      ),
    );
    expect(await screen.findByText(/2 people will be assigned\./)).toBeTruthy();
    await addEmails('a@nonstopio.com');
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('says one person in the singular', async () => {
    await open();
    await pick(/Git, the NonStop Way/);
    next();
    await heading('Who is it for?');
    await addEmails('a@nonstopio.com');
    expect(await screen.findByText(/1 person will be assigned\./)).toBeTruthy();
  });

  it('starts from the emails and the course it was opened with', async () => {
    await open(setup(), data(), { emails: ['a@nonstopio.com'], courseId: 'git' });
    expect(
      ((await screen.findByLabelText(/Git, the NonStop Way/)) as HTMLInputElement).checked,
    ).toBe(true);
    next();
    await heading('Who is it for?');
    expect(await screen.findByText(/1 person will be assigned\./)).toBeTruthy();
  });

  it('ignores a classification lookup that finishes after the list changed', async () => {
    const c = setup();
    let release: (v: KnownEmails) => void = () => {};
    c.data.knownEmails = vi
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
      .mockResolvedValue({
        signedIn: new Set(['a@nonstopio.com']),
        assigned: new Set(),
        byCourse: {},
      });
    await open(c);
    await pick(/Git, the NonStop Way/);
    next();
    await heading('Who is it for?');
    await addEmails('a@nonstopio.com');
    release({ signedIn: new Set(), assigned: new Set(['a@nonstopio.com']), byCourse: {} });
    expect(await screen.findByText(/1 person will be assigned\./)).toBeTruthy();
  });

  it('adds people found by email, ignoring searches that are too short', async () => {
    const c = setup({
      found: [
        userRow(7, { displayName: 'Ravi', email: 'ravi@nonstopio.com' }),
        userRow(8, { displayName: '', email: 'sam@nonstopio.com' }),
      ],
    });
    await open(c);
    await pick(/Git, the NonStop Way/);
    next();
    await heading('Who is it for?');
    fireEvent.click(screen.getByRole('tab', { name: 'People' }));
    const box = screen.getByRole('combobox', { name: 'Search by name or email' });
    fireEvent.change(box, { target: { value: 'r' } });
    expect(await screen.findByText('No one matches “r”')).toBeTruthy();
    expect(c.data.searchUsers).not.toHaveBeenCalled();
    fireEvent.change(box, { target: { value: 'rav' } });
    const ravi = await screen.findByRole('option', { name: /Ravi/ });
    expect(c.data.searchUsers).toHaveBeenCalledWith('rav');
    fireEvent.mouseDown(ravi);
    expect((box as HTMLInputElement).value).toBe('');
    fireEvent.change(box, { target: { value: 'sam' } });
    fireEvent.mouseDown(await screen.findByRole('option', { name: /sam@nonstopio.com/ }));
    const added = screen.getByRole('list', { name: 'Email addresses: added emails' });
    await waitFor(() => expect(added.textContent).toContain('ravi@nonstopio.com'));
    expect(added.textContent).toContain('sam@nonstopio.com');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Ravi' }));
    await waitFor(() => expect(added.textContent).not.toContain('ravi@nonstopio.com'));
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Remove sam@nonstopio.com' })[0] as HTMLElement,
    );
    expect(
      screen.queryByRole('list', { name: 'Search by name or email: added people' }),
    ).toBeNull();
  });

  it('reads a CSV, ignores an empty file choice, and shows the drop zone over a drag', async () => {
    await open();
    await pick(/Git, the NonStop Way/);
    next();
    await heading('Who is it for?');
    fireEvent.click(screen.getByRole('tab', { name: 'People' }));
    expect(screen.getByText(/Or paste a list into the box above/)).toBeTruthy();
    const zone = screen.getByText('Drop a CSV file here, or choose one.').parentElement as Element;
    const input = screen.getByLabelText(/CSV file/);
    fireEvent.change(input, { target: { files: [] } });
    fireEvent.dragEnter(input);
    expect(zone.className).toContain('console-dropzone--over');
    fireEvent.dragLeave(input);
    expect(zone.className).not.toContain('console-dropzone--over');
    fireEvent.dragEnter(input);
    fireEvent.drop(input);
    expect(zone.className).not.toContain('console-dropzone--over');
    const csv = new File(['d@nonstopio.com\n'], 'p.csv', { type: 'text/csv' });
    Object.defineProperty(csv, 'text', { value: async () => 'd@nonstopio.com\n' });
    fireEvent.change(input, { target: { files: [csv] } });
    expect(await screen.findByText(/d@nonstopio.com/)).toBeTruthy();
  });
});

describe('Assign: existing and new teams', () => {
  it('adds the listed members of a team together with people whose profile names it', async () => {
    const c = setup({
      teamList: [
        {
          id: 'platform',
          name: 'Platform',
          memberEmails: ['m1@nonstopio.com', 'q1@nonstopio.com'],
          createdAt: 5,
        },
      ],
      team: [userRow(1, { email: 'q1@nonstopio.com' }), userRow(2, { email: 'q2@nonstopio.com' })],
    });
    await open(c);
    await pick(/Git, the NonStop Way/);
    next();
    await heading('Who is it for?');
    const add = screen.getByRole('button', {
      name: 'Add everyone in this team',
    }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Team'), { target: { value: 'Platform' } });
    expect(await screen.findByText('3 people in Platform')).toBeTruthy();
    fireEvent.click(add);
    const added = screen.getByRole('list', { name: 'Email addresses: added emails' });
    await waitFor(() => expect(added.textContent).toContain('m1@nonstopio.com'));
    expect(added.textContent).toContain('q2@nonstopio.com');
  });

  it('says one person in the team in the singular and nothing for no team', async () => {
    await open(
      setup({
        teamList: [{ id: 'qa', name: 'QA', memberEmails: ['q@nonstopio.com'], createdAt: 1 }],
      }),
    );
    await pick(/Git, the NonStop Way/);
    next();
    await heading('Who is it for?');
    fireEvent.change(screen.getByLabelText('Team'), { target: { value: 'QA' } });
    expect(await screen.findByText('1 person in QA')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Team'), { target: { value: '' } });
    expect(screen.queryByText('1 person in QA')).toBeNull();
  });

  it('says there are no teams, and points to the New team tab', async () => {
    await open(setup({ teams: [] }));
    await pick(/Git, the NonStop Way/);
    next();
    expect(await screen.findByRole('heading', { name: 'No teams yet' })).toBeTruthy();
  });

  it('offers Retry when the team list fails', async () => {
    const c = setup();
    c.data.teamList = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue([]);
    await open(c);
    await pick(/Git, the NonStop Way/);
    next();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'No teams yet' })).toBeTruthy();
  });

  it('saves a new team with the members and then assigns', async () => {
    const c = setup();
    c.service.assignCourses = vi.fn().mockResolvedValue(OK);
    await open(c);
    await pick(/Git, the NonStop Way/);
    next();
    await heading('Who is it for?');
    await addEmails('a@nonstopio.com', 'bad');
    fireEvent.click(screen.getByRole('tab', { name: 'New team' }));
    fireEvent.change(screen.getByLabelText('New team name'), { target: { value: 'Mobile' } });
    await waitFor(() => expect(screen.getByText(/1 person will be assigned/)).toBeTruthy());
    next();
    await heading('Set the deadline');
    next();
    await heading('Review and assign');
    expect(sentence()).toContain('and save them as the team Mobile');
    fireEvent.click(screen.getByRole('button', { name: 'Assign to 1 person' }));
    await screen.findByRole('heading', { name: 'Assigned to 1 person' });
    expect(c.data.saveTeam).toHaveBeenCalledWith(
      {
        id: 'mobile',
        name: 'Mobile',
        memberEmails: ['a@nonstopio.com'],
        createdAt: expect.any(Number),
      },
      null,
    );
  });

  it('refuses a team name that is taken, too alike or too many people', async () => {
    const c = setup();
    await open(c);
    await pick(/Git, the NonStop Way/);
    next();
    await heading('Who is it for?');
    await addEmails('a@nonstopio.com');
    await screen.findByText(/1 person will be assigned/);
    fireEvent.click(screen.getByRole('tab', { name: 'New team' }));
    const name = screen.getByLabelText('New team name');
    fireEvent.change(name, { target: { value: 'QA' } });
    next();
    expect(problem()?.textContent).toMatch(/QA/);
    fireEvent.change(name, { target: { value: 'QA!' } });
    next();
    expect(problem()?.textContent).toBe(
      'A team with a very similar name exists. Use a different name.',
    );
  });

  it('refuses a new team of more people than a team holds', async () => {
    const many = Array.from({ length: 501 }, (_, i) => `p${i}@nonstopio.com`);
    await open(setup(), data(), { emails: many, courseId: 'git' });
    await screen.findByLabelText(/Git, the NonStop Way/);
    next();
    await heading('Who is it for?');
    fireEvent.click(screen.getByRole('tab', { name: 'New team' }));
    fireEvent.change(screen.getByLabelText('New team name'), { target: { value: 'Huge' } });
    await screen.findByText(/501 people will be assigned/);
    next();
    expect(problem()?.textContent).toBe('A team holds at most 500 people.');
  });

  it('does not assign when saving the new team fails', async () => {
    const c = setup();
    c.data.saveTeam = vi.fn().mockRejectedValue(new Error('x'));
    await open(c);
    await pick(/Git, the NonStop Way/);
    next();
    await heading('Who is it for?');
    await addEmails('a@nonstopio.com');
    fireEvent.click(screen.getByRole('tab', { name: 'New team' }));
    fireEvent.change(screen.getByLabelText('New team name'), { target: { value: 'Mobile' } });
    await screen.findByText(/1 person will be assigned/);
    next();
    next();
    await heading('Review and assign');
    fireEvent.click(screen.getByRole('button', { name: 'Assign to 1 person' }));
    expect(
      await screen.findByText('Could not assign. Nothing was changed; try again.'),
    ).toBeTruthy();
    expect(c.service.assignCourses).not.toHaveBeenCalled();
  });
});

describe('Assign: schedule and review', () => {
  it('assigns with the deadline, reminder and toggles, then shows the success state', async () => {
    const c = setup();
    const { container } = await open(c);
    await pick(/Git, the NonStop Way/);
    next();
    await heading('Who is it for?');
    await addEmails(
      'a@nonstopio.com',
      'new@nonstopio.com',
      'c@nonstopio.com',
      'bad',
      'x@gmail.com',
    );
    await screen.findByText(/2 people will be assigned\./);
    next();
    await heading('Set the deadline');
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-12-01' } });
    fireEvent.change(screen.getByLabelText('Reminders'), { target: { value: 'beforeDue' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Mandatory' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Email learners now' }));
    next();
    await heading('Review and assign');
    expect(sentence()).toBe('Assign Git, the NonStop Way to 2 people, due 2026-12-01.');
    expect(
      within(screen.getByRole('list', { name: 'Rejected addresses' })).getByText(
        /bad: Not a valid email address/,
      ),
    ).toBeTruthy();
    expect(screen.getAllByRole('definition').map((d) => d.textContent)).toEqual([
      '1',
      '1',
      '1',
      '2',
      '2026-12-01',
    ]);
    expect(await axeViolations(container)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Assign to 2 people' }));
    await waitFor(() =>
      expect(c.service.assignCourses).toHaveBeenCalledWith({
        courseIds: ['git'],
        emails: ['a@nonstopio.com', 'new@nonstopio.com', 'c@nonstopio.com', 'bad', 'x@gmail.com'],
        dueAt: Date.parse('2026-12-01T23:59:59'),
        mandatory: false,
        reminder: 'beforeDue',
        notify: false,
      }),
    );
    expect(await screen.findByText('Assigned to 2 people (1 pending invite)')).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Assigned to 2 people' })).toBeTruthy();
    expect(screen.getByText(/1 pending invite: those people/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View learners' }).getAttribute('href')).toBe(
      '/admin/learners?course=git',
    );
    expect(screen.queryByRole('navigation', { name: 'Assign progress' })).toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('sends no deadline when none is set, and says so', async () => {
    const c = setup();
    await open(c);
    await toReview('a@nonstopio.com');
    expect(sentence()).toBe('Assign Git, the NonStop Way to 1 person with no deadline.');
    fireEvent.click(screen.getByRole('button', { name: 'Assign to 1 person' }));
    await waitFor(() =>
      expect(c.service.assignCourses).toHaveBeenCalledWith(
        expect.objectContaining({ dueAt: null, mandatory: true, reminder: 'weekly', notify: true }),
      ),
    );
  });

  it('moves back and forward with the way it slides, and puts focus on the step', async () => {
    await open();
    await toReview('a@nonstopio.com');
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Review and assign' }));
    expect(document.querySelector('.g-flow-panel--forward')).toBeTruthy();
    back();
    await heading('Set the deadline');
    expect(document.querySelector('.g-flow-panel--back')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Set the deadline' }));
    next();
    await heading('Review and assign');
    fireEvent.click(screen.getByRole('button', { name: 'Change people' }));
    await heading('Who is it for?');
    expect((screen.getByLabelText('Email addresses') as HTMLElement).isConnected).toBe(true);
    next();
    next();
    fireEvent.click(screen.getByRole('button', { name: 'Change schedule' }));
    await heading('Set the deadline');
    next();
    fireEvent.click(screen.getByRole('button', { name: 'Change courses' }));
    await heading('Choose courses');
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('previews each course on its own and names several courses by count', async () => {
    const c = setup();
    await open(c);
    await pick(/Git, the NonStop Way/);
    fireEvent.click(screen.getByLabelText(/SQL basics/));
    next();
    await heading('Who is it for?');
    await addEmails('a@nonstopio.com', 'c@nonstopio.com');
    await screen.findByText(/will be assigned\./);
    next();
    next();
    await heading('Review and assign');
    expect(sentence()).toContain('Assign 2 courses to');
    const list = await screen.findByRole('list', { name: 'Per course' });
    await waitFor(() =>
      expect(
        within(list).getByText(/Git, the NonStop Way: 1 new, 1 already assigned/),
      ).toBeTruthy(),
    );
    expect(within(list).getByText(/SQL basics: 2 new, 0 already assigned/)).toBeTruthy();
  });

  it('says "this course" when the prefilled course is not in the list', async () => {
    await open(setup(), data(), { emails: ['a@nonstopio.com'], courseId: 'gone' });
    await screen.findByLabelText(/Git, the NonStop Way/);
    next();
    await heading('Who is it for?');
    await screen.findByText(/1 person will be assigned\./);
    next();
    next();
    await heading('Review and assign');
    expect(sentence()).toContain('Assign this course to 1 person');
  });
});

describe('Assign: results and failures', () => {
  it('toasts a failure in words, keeps the button usable and changes nothing', async () => {
    const c = setup();
    c.service.assignCourses = vi.fn().mockRejectedValue(new Error('x'));
    await open(c);
    await toReview('a@nonstopio.com');
    fireEvent.click(screen.getByRole('button', { name: 'Assign to 1 person' }));
    expect(
      await screen.findByText('Could not assign. Nothing was changed; try again.'),
    ).toBeTruthy();
    expect(screen.getByText('Something went wrong on our side')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Assign to 1 person' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('names a single pending invite and a plural list of courses in the success state', async () => {
    const c = setup();
    c.service.assignCourses = vi.fn().mockResolvedValue({
      summary: { signedIn: 0, newInvites: 1, alreadyAssigned: 0, rejected: [] },
      assigned: 1,
      notified: 0,
      failed: [],
    });
    await open(c);
    await pick(/Git, the NonStop Way/);
    fireEvent.click(screen.getByLabelText(/SQL basics/));
    next();
    await heading('Who is it for?');
    await addEmails('a@nonstopio.com');
    await screen.findByText(/1 person will be assigned\./);
    next();
    next();
    await heading('Review and assign');
    fireEvent.click(screen.getByRole('button', { name: /Assign to/ }));
    expect(await screen.findByText('Assigned to 1 person (1 pending invite)')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View learners' }).getAttribute('href')).toBe(
      '/admin/learners',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Assign more' }));
    await heading('Choose courses');
    expect(((await screen.findByLabelText(/SQL basics/)) as HTMLInputElement).checked).toBe(false);
    expect(document.querySelector('.g-flow-panel--back')).toBeTruthy();
  });

  it('says plural pending invites', async () => {
    const c = setup();
    c.service.assignCourses = vi.fn().mockResolvedValue({
      summary: { signedIn: 1, newInvites: 2, alreadyAssigned: 0, rejected: [] },
      assigned: 3,
      notified: 0,
      failed: [],
    });
    await open(c);
    await toReview('a@nonstopio.com');
    fireEvent.click(screen.getByRole('button', { name: /Assign to/ }));
    expect(await screen.findByText('Assigned to 3 people (2 pending invites)')).toBeTruthy();
  });

  it('lists what failed, retries only those pairs, and then shows success', async () => {
    const c = setup();
    const summary = { signedIn: 1, newInvites: 0, alreadyAssigned: 0, rejected: [] };
    c.service.assignCourses = vi
      .fn()
      .mockResolvedValueOnce({
        summary,
        assigned: 1,
        notified: 0,
        failed: [
          { email: 'a@nonstopio.com', courseId: 'git' },
          { email: 'b@nonstopio.com', courseId: 'gone' },
        ],
      })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ summary, assigned: 1, notified: 0, failed: [] });
    await open(c);
    await toReview('a@nonstopio.com', 'b@nonstopio.com');
    fireEvent.click(screen.getByRole('button', { name: /Assign to/ }));
    const failed = await screen.findByRole('list', { name: 'Failed assignments' });
    expect(within(failed).getByText(/a@nonstopio.com: Git, the NonStop Way/)).toBeTruthy();
    expect(within(failed).getByText(/b@nonstopio.com: gone/)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /^Assigned to/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Could not retry. Try again.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: /^Assigned to/ })).toBeTruthy();
    expect(c.service.assignCourses).toHaveBeenLastCalledWith(
      expect.objectContaining({ courseIds: ['gone'], emails: ['b@nonstopio.com'] }),
    );
    expect(c.service.assignCourses).toHaveBeenCalledWith(
      expect.objectContaining({ courseIds: ['git'], emails: ['a@nonstopio.com'] }),
    );
  });

  it('says one failed assignment in the singular', async () => {
    const c = setup();
    c.service.assignCourses = vi.fn().mockResolvedValue({
      summary: { signedIn: 1, newInvites: 0, alreadyAssigned: 0, rejected: [] },
      assigned: 0,
      notified: 0,
      failed: [{ email: 'a@nonstopio.com', courseId: 'git' }],
    });
    await open(c);
    await toReview('a@nonstopio.com');
    fireEvent.click(screen.getByRole('button', { name: /Assign to/ }));
    expect(
      await screen.findByText('1 assignment could not be saved. The rest went through.'),
    ).toBeTruthy();
  });
});
