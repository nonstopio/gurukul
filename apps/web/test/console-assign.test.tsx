import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axeViolations } from './axe';
import { fakeConsole, userRow } from './fake-console';
import { fakeData, makeCourse } from './fake-data';
import { openApp } from './harness';

const kulapati = { roles: ['kulapati'] as Array<'kulapati'> };
const PATH = '/kulapati/assign';
const draft = makeCourse({ id: 'draft', title: 'Draft course', status: 'draft' });
const sql = makeCourse({ id: 'sql', title: 'SQL basics' });
const base = makeCourse();
const one = makeCourse({
  id: 'one',
  title: 'One lesson',
  parvas: [{ id: 'p1', title: 'Only', items: base.parvas.flatMap((p) => p.items).slice(0, 1) }],
});

function setup(over: Parameters<typeof fakeConsole>[0] = {}) {
  const c = fakeConsole({ teams: ['QA'], ...over });
  c.data.knownEmails = vi.fn().mockResolvedValue({
    signedIn: new Set(['a@nonstopio.com']),
    assigned: new Set(['c@nonstopio.com']),
  });
  return c;
}
const data = () => fakeData({ courses: [makeCourse(), sql, draft] });

async function addEmails(...emails: string[]) {
  const input = screen.getByLabelText('Email addresses');
  for (const e of emails) {
    fireEvent.change(input, { target: { value: e } });
    fireEvent.keyDown(input, { key: 'Enter' });
  }
}

describe('Assign courses', () => {
  it('lists only published courses and keeps the button off until there is something to assign', async () => {
    const c = setup();
    const { container } = await openApp(PATH, { ...kulapati, console: c, data: data() });
    expect(await screen.findByLabelText(/Git, the NonStop Way/)).toBeTruthy();
    expect(screen.getByLabelText(/SQL basics/)).toBeTruthy();
    expect(screen.queryByLabelText(/Draft course/)).toBeNull();
    const submit = screen.getByRole('button', { name: 'Assign' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(screen.getByText('No deadline')).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('classifies pasted emails and previews exactly what will happen', async () => {
    const c = setup();
    await openApp(PATH, { ...kulapati, console: c, data: data() });
    fireEvent.click(await screen.findByLabelText(/Git, the NonStop Way/));
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
    const summary = screen.getByRole('complementary', { name: 'Summary' });
    await waitFor(() => expect(within(summary).getByText('Assign to 2 people')).toBeTruthy());
    expect(within(summary).getByText(/people will get Git, the NonStop Way/)).toBeTruthy();
    expect(
      within(summary).getByText('Not an @nonstopio.com address', { exact: false }),
    ).toBeTruthy();
    expect(within(summary).getByText(/bad: Not a valid email address/)).toBeTruthy();
    const dds = within(summary)
      .getAllByRole('definition')
      .map((d) => d.textContent);
    expect(dds).toEqual(['1', '1', '1', '2', 'No deadline']);
  });

  it('speaks of one person and one course in the singular, several courses by count', async () => {
    const c = setup();
    await openApp(PATH, { ...kulapati, console: c, data: data() });
    fireEvent.click(await screen.findByLabelText(/Git, the NonStop Way/));
    await addEmails('a@nonstopio.com');
    expect(await screen.findByRole('button', { name: 'Assign to 1 person' })).toBeTruthy();
    expect(screen.getByText(/person will get Git, the NonStop Way/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/SQL basics/));
    expect(await screen.findByText(/person will get 2 courses/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/SQL basics/));
    fireEvent.click(screen.getByLabelText(/Git, the NonStop Way/));
    expect(screen.getByText(/person will get 0 courses/)).toBeTruthy();
  });

  it('assigns with the deadline, reminder and toggles, then opens the learners list', async () => {
    const c = setup();
    const { router } = await openApp(PATH, { ...kulapati, console: c, data: data() });
    fireEvent.click(await screen.findByLabelText(/Git, the NonStop Way/));
    await addEmails('a@nonstopio.com', 'new@nonstopio.com');
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-12-01' } });
    fireEvent.change(screen.getByLabelText('Reminders'), { target: { value: 'beforeDue' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Mandatory' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Email learners now' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Assign to 2 people' }));
    await waitFor(() =>
      expect(c.service.assignCourses).toHaveBeenCalledWith({
        courseIds: ['git'],
        emails: ['a@nonstopio.com', 'new@nonstopio.com'],
        dueAt: Date.parse('2026-12-01T23:59:59'),
        mandatory: false,
        reminder: 'beforeDue',
        notify: false,
      }),
    );
    expect(await screen.findByText('Assigned to 2 people (1 pending invite)')).toBeTruthy();
    await waitFor(() => expect(router.state.location.pathname).toBe('/kulapati/learners'));
    expect(router.state.location.search).toBe('?course=git');
  });

  it('sends no deadline when none is set', async () => {
    const c = setup();
    await openApp(PATH, { ...kulapati, console: c, data: data() });
    fireEvent.click(await screen.findByLabelText(/Git, the NonStop Way/));
    await addEmails('a@nonstopio.com');
    fireEvent.click(await screen.findByRole('button', { name: 'Assign to 1 person' }));
    await waitFor(() =>
      expect(c.service.assignCourses).toHaveBeenCalledWith(
        expect.objectContaining({ dueAt: null, mandatory: true, reminder: 'weekly', notify: true }),
      ),
    );
  });

  it('stays put and says nothing was changed when assigning fails', async () => {
    const c = setup();
    c.service.assignCourses = vi.fn().mockRejectedValue(new Error('x'));
    const { router } = await openApp(PATH, { ...kulapati, console: c, data: data() });
    fireEvent.click(await screen.findByLabelText(/Git, the NonStop Way/));
    await addEmails('a@nonstopio.com');
    fireEvent.click(await screen.findByRole('button', { name: 'Assign to 1 person' }));
    expect(
      await screen.findByText('Could not assign. Nothing was changed; try again.'),
    ).toBeTruthy();
    expect(router.state.location.pathname).toBe(PATH);
    expect(
      (screen.getByRole('button', { name: 'Assign to 1 person' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('starts from the emails and the course it was opened with', async () => {
    const c = setup();
    await openApp(
      { pathname: PATH, state: { emails: ['a@nonstopio.com'], courseId: 'git' } },
      { ...kulapati, console: c, data: data() },
    );
    expect(
      ((await screen.findByLabelText(/Git, the NonStop Way/)) as HTMLInputElement).checked,
    ).toBe(true);
    expect(await screen.findByRole('button', { name: 'Assign to 1 person' })).toBeTruthy();
  });

  it('says "this course" when the prefilled course is not in the list', async () => {
    const c = setup();
    await openApp(
      { pathname: PATH, state: { emails: ['a@nonstopio.com'], courseId: 'gone' } },
      { ...kulapati, console: c, data: data() },
    );
    expect(await screen.findByText(/person will get this course/)).toBeTruthy();
  });

  it('ignores a classification lookup that finishes after the list changed', async () => {
    const c = setup();
    let release: (v: { signedIn: Set<string>; assigned: Set<string> }) => void = () => {};
    c.data.knownEmails = vi
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
      .mockResolvedValue({ signedIn: new Set(['a@nonstopio.com']), assigned: new Set() });
    await openApp(PATH, { ...kulapati, console: c, data: data() });
    fireEvent.click(await screen.findByLabelText(/Git, the NonStop Way/));
    await addEmails('a@nonstopio.com');
    release({ signedIn: new Set(), assigned: new Set(['a@nonstopio.com']) });
    expect(await screen.findByRole('button', { name: 'Assign to 1 person' })).toBeTruthy();
  });

  it('adds people found by email, ignoring searches that are too short', async () => {
    const c = setup({
      found: [
        userRow(7, { displayName: 'Ravi', email: 'ravi@nonstopio.com' }),
        userRow(8, { displayName: '', email: 'sam@nonstopio.com' }),
      ],
    });
    await openApp(PATH, { ...kulapati, console: c, data: data() });
    await screen.findByLabelText(/Git, the NonStop Way/);
    fireEvent.change(screen.getByLabelText('Search by name or email'), { target: { value: 'r' } });
    expect(c.data.searchUsers).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Search by name or email'), {
      target: { value: 'rav' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Add Ravi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add sam@nonstopio.com' }));
    await waitFor(() =>
      expect(
        screen.getByRole('list', { name: 'Email addresses: added emails' }).textContent,
      ).toContain('ravi@nonstopio.com'),
    );
  });

  it('shows the paste hint, reads a CSV, and ignores an empty file choice', async () => {
    const c = setup();
    await openApp(PATH, { ...kulapati, console: c, data: data() });
    await screen.findByLabelText(/Git, the NonStop Way/);
    fireEvent.click(screen.getByRole('tab', { name: 'Paste emails' }));
    expect(screen.getByText(/Paste a list into the box above/)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Upload CSV' }));
    const file = screen.getByLabelText(/CSV file/);
    fireEvent.change(file, { target: { files: [] } });
    const csv = new File(['email,name\nCSV@nonstopio.com,C\n'], 'people.csv', { type: 'text/csv' });
    Object.defineProperty(csv, 'text', { value: async () => 'email,name\nCSV@nonstopio.com,C\n' });
    fireEvent.change(file, { target: { files: [csv] } });
    expect(await screen.findByText(/csv@nonstopio.com/)).toBeTruthy();
  });

  it('adds a whole team, only once a team is chosen', async () => {
    const c = setup({
      team: [userRow(1, { email: 'q1@nonstopio.com' }), userRow(2, { email: 'q2@nonstopio.com' })],
    });
    await openApp(PATH, { ...kulapati, console: c, data: data() });
    await screen.findByLabelText(/Git, the NonStop Way/);
    fireEvent.click(screen.getByRole('tab', { name: 'Whole team' }));
    const add = screen.getByRole('button', {
      name: 'Add everyone in this team',
    }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Team'), { target: { value: 'QA' } });
    fireEvent.click(add);
    await waitFor(() => expect(c.data.usersInTeam).toHaveBeenCalledWith('QA'));
    expect(await screen.findByText(/q2@nonstopio.com/)).toBeTruthy();
  });
});

describe('Assign screen details', () => {
  it('shows lesson counts, a team size and a CSV drop zone, and plain toast wording', async () => {
    const c = setup({ team: [userRow(1, { email: 'q1@nonstopio.com' })] });
    c.service.assignCourses = vi.fn().mockResolvedValue({
      summary: { signedIn: 1, newInvites: 2, alreadyAssigned: 0, rejected: [] },
      assigned: 3,
      notified: 0,
    });
    const { router } = await openApp(PATH, { ...kulapati, console: c, data: data() });
    expect((await screen.findAllByText(/4 lessons · /)).length).toBe(2);
    fireEvent.click(screen.getByRole('tab', { name: 'Whole team' }));
    fireEvent.change(screen.getByLabelText('Team'), { target: { value: 'QA' } });
    expect(await screen.findByText('1 person in QA')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Team'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Upload CSV' }));
    const zone = screen.getByText('Drop a CSV file here, or choose one.').parentElement as Element;
    const input = screen.getByLabelText(/CSV file/);
    fireEvent.dragEnter(input);
    expect(zone.className).toContain('dropzone--over');
    fireEvent.dragLeave(input);
    expect(zone.className).not.toContain('dropzone--over');
    fireEvent.dragEnter(input);
    fireEvent.drop(input);
    expect(zone.className).not.toContain('dropzone--over');
    const csv = new File(['d@nonstopio.com\n'], 'p.csv', { type: 'text/csv' });
    Object.defineProperty(csv, 'text', { value: async () => 'd@nonstopio.com\n' });
    fireEvent.change(input, { target: { files: [csv] } });
    expect(await screen.findByText(/d@nonstopio.com/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Git, the NonStop Way/));
    fireEvent.click(screen.getByLabelText(/SQL basics/));
    fireEvent.click(await screen.findByRole('button', { name: /Assign to/ }));
    expect(await screen.findByText('Assigned to 3 people (2 pending invites)')).toBeTruthy();
    await waitFor(() => expect(router.state.location.pathname).toBe('/kulapati/learners'));
    expect(router.state.location.search).toBe('');
  });

  it('names a single pending invite in the singular', async () => {
    const c = setup();
    c.service.assignCourses = vi.fn().mockResolvedValue({
      summary: { signedIn: 0, newInvites: 1, alreadyAssigned: 0, rejected: [] },
      assigned: 1,
      notified: 0,
    });
    await openApp(PATH, { ...kulapati, console: c, data: data() });
    fireEvent.click(await screen.findByLabelText(/Git, the NonStop Way/));
    await addEmails('a@nonstopio.com');
    fireEvent.click(await screen.findByRole('button', { name: /Assign to/ }));
    expect(await screen.findByText('Assigned to 1 person (1 pending invite)')).toBeTruthy();
  });

  it('says "1 lesson" for a one-lesson course', async () => {
    await openApp(PATH, { ...kulapati, console: setup(), data: fakeData({ courses: [one] }) });
    expect(await screen.findByText(/1 lesson · /)).toBeTruthy();
  });
});
