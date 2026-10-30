import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axeViolations } from './axe';
import { fakeConsole, userRow } from './fake-console';
import { fakeData, makeCourse } from './fake-data';
import { openApp } from './harness';
import type { KnownEmails, UserRow } from '../src/console/types';

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
  const input = screen.getByRole('combobox', { name: 'Add people' });
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
  people();
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

const people = () => fireEvent.click(screen.getByRole('button', { name: 'People' }));
const teamsTab = () => fireEvent.click(screen.getByRole('button', { name: 'Teams' }));
const toAudience = async () => {
  await pick(/Git, the NonStop Way/);
  next();
  await heading('Who is it for?');
};
const PLATFORM = {
  id: 'platform',
  name: 'Platform',
  memberEmails: ['m1@nonstopio.com', 'q1@nonstopio.com'],
  createdAt: 5,
};
const QA = { id: 'qa', name: 'QA', memberEmails: ['q9@nonstopio.com'], createdAt: 6 };

describe('Assign: audience step, people', () => {
  it('classifies pasted emails, counts who will be assigned and needs one person', async () => {
    const c = setup();
    await open(c);
    await toAudience();
    next();
    expect(problem()?.textContent).toBe(
      'Pick at least one team that has people who can be assigned.',
    );
    people();
    next();
    expect(problem()?.textContent).toBe('Pick at least one person who can be assigned.');
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
    await toAudience();
    people();
    await addEmails('a@nonstopio.com');
    expect(await screen.findByText(/1 person will be assigned\./)).toBeTruthy();
  });

  it('starts on People with the emails and the course it was opened with', async () => {
    await open(setup(), data(), { emails: ['a@nonstopio.com'], courseId: 'git' });
    expect(
      ((await screen.findByLabelText(/Git, the NonStop Way/)) as HTMLInputElement).checked,
    ).toBe(true);
    next();
    await heading('Who is it for?');
    expect(await screen.findByText(/1 person will be assigned\./)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'People' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
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
    await toAudience();
    people();
    await addEmails('a@nonstopio.com');
    release({ signedIn: new Set(), assigned: new Set(['a@nonstopio.com']), byCourse: {} });
    expect(await screen.findByText(/1 person will be assigned\./)).toBeTruthy();
  });

  it('lists the first people with their photos and how many there are, and picks one with a click', async () => {
    const users = [
      userRow(1, { displayName: 'Person 1', email: 'p1@nonstopio.com', photoURL: '/p1.png' }),
      userRow(2, { displayName: 'Person 2', email: 'p2@nonstopio.com' }),
    ];
    const c = setup({ users, count: 25 });
    await open(c);
    await toAudience();
    people();
    const box = screen.getByRole('combobox', { name: 'Add people' });
    fireEvent.focus(box);
    expect(await screen.findByText('Showing 2 of 25 people')).toBeTruthy();
    expect(c.data.usersPage).toHaveBeenCalledWith(null, 10);
    expect(document.querySelector('.g-people__option img')?.getAttribute('src')).toBe('/p1.png');
    fireEvent.mouseDown(screen.getByRole('option', { name: /Person 1/ }));
    const added = screen.getByRole('list', { name: 'Add people: added people' });
    expect(added.textContent).toContain('Person 1');
    expect(await screen.findByText(/1 person will be assigned/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Person 1' }));
    expect(await screen.findByText(/0 people will be assigned/)).toBeTruthy();
  });

  it('searches people from two characters, offers an email nobody has, and invites it', async () => {
    const c = setup({
      found: [
        userRow(7, { displayName: 'Ravi', email: 'ravi@nonstopio.com' }),
        userRow(8, { displayName: '', email: 'sam@nonstopio.com' }),
      ],
    });
    await open(c);
    await toAudience();
    people();
    const box = screen.getByRole('combobox', { name: 'Add people' });
    fireEvent.change(box, { target: { value: 'r' } });
    await new Promise((r) => setTimeout(r, 350));
    expect(c.data.searchUsers).not.toHaveBeenCalled();
    fireEvent.change(box, { target: { value: 'rav' } });
    const ravi = await screen.findByRole('option', { name: /Ravi/ });
    expect(c.data.searchUsers).toHaveBeenCalledWith('rav');
    fireEvent.mouseDown(ravi);
    fireEvent.change(box, { target: { value: 'sam' } });
    fireEvent.mouseDown(await screen.findByRole('option', { name: /sam@nonstopio.com/ }));
    fireEvent.change(box, { target: { value: 'guest@nonstopio.com' } });
    fireEvent.mouseDown(await screen.findByRole('option', { name: /Add “guest@nonstopio.com”/ }));
    const added = screen.getByRole('list', { name: 'Add people: added people' });
    expect(added.textContent).toContain('Ravi');
    expect(added.textContent).toContain('sam@nonstopio.com');
    expect(added.textContent).toContain('guest@nonstopio.com');
  });

  it('shows only the answer to the newest search', async () => {
    const c = setup();
    let slow: (rows: UserRow[]) => void = () => {};
    c.data.searchUsers = vi
      .fn()
      .mockImplementationOnce(() => new Promise<UserRow[]>((resolve) => (slow = resolve)))
      .mockResolvedValue([userRow(5, { displayName: 'Rita', email: 'rita@nonstopio.com' })]);
    await open(c);
    await toAudience();
    people();
    const box = screen.getByRole('combobox', { name: 'Add people' });
    fireEvent.change(box, { target: { value: 'ri' } });
    await waitFor(() => expect(c.data.searchUsers).toHaveBeenCalledWith('ri'));
    fireEvent.change(box, { target: { value: 'rit' } });
    expect(await screen.findByRole('option', { name: /Rita/ })).toBeTruthy();
    slow([userRow(6, { displayName: 'Stale', email: 'stale@nonstopio.com' })]);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('Stale')).toBeNull();
  });

  it('says no one matches, and that an email can still invite them', async () => {
    await open(setup({ found: [] }));
    await toAudience();
    people();
    fireEvent.change(screen.getByRole('combobox', { name: 'Add people' }), {
      target: { value: 'zzz' },
    });
    expect(await screen.findByText('No one matches “zzz”')).toBeTruthy();
  });

  it('reads a CSV, ignores an empty file choice, and shows the drop zone over a drag', async () => {
    await open();
    await toAudience();
    people();
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

describe('Assign: audience step, teams', () => {
  it('starts on Teams, counts them, and assigns everyone on the teams picked', async () => {
    const c = setup({
      teamList: [PLATFORM, QA],
      team: [userRow(1, { email: 'q1@nonstopio.com' }), userRow(2, { email: 'q2@nonstopio.com' })],
    });
    await open(c);
    await toAudience();
    expect(screen.getByRole('button', { name: 'Teams' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Showing 2 of 2 teams')).toBeTruthy();
    expect(screen.getByText('2 members')).toBeTruthy();
    expect(screen.getByText('1 member')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Platform'));
    expect(
      await screen.findByText(/3 people will be assigned\. From 1 team: Platform\./),
    ).toBeTruthy();
    fireEvent.click(screen.getByLabelText('QA'));
    expect(
      await screen.findByText(/4 people will be assigned\. From 2 teams: Platform, QA\./),
    ).toBeTruthy();
    expect(c.data.usersInTeam).toHaveBeenCalledWith('QA');
    expect(screen.getByText(/2 selected/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('QA'));
    expect(await screen.findByText(/3 people will be assigned/)).toBeTruthy();
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('assigns the teams picked, and names them on the review', async () => {
    const c = setup({ teamList: [PLATFORM] });
    c.service.assignCourses = vi.fn().mockResolvedValue(OK);
    await open(c);
    await toAudience();
    fireEvent.click(screen.getByLabelText('Platform'));
    await screen.findByText(/will be assigned\. From 1 team/);
    next();
    await heading('Set the deadline');
    next();
    await heading('Review and assign');
    expect(sentence()).toContain('from Platform');
    fireEvent.click(screen.getByRole('button', { name: /^Assign to/ }));
    await screen.findByRole('heading', { name: /^Assigned to/ });
    expect(c.service.assignCourses).toHaveBeenCalledWith(
      expect.objectContaining({ emails: ['m1@nonstopio.com', 'q1@nonstopio.com'] }),
    );
  });

  it('waits for the members of a team before it lets you go on', async () => {
    const c = setup({ teamList: [PLATFORM] });
    let release: (rows: UserRow[]) => void = () => {};
    c.data.usersInTeam = vi.fn(() => new Promise<UserRow[]>((resolve) => (release = resolve)));
    await open(c);
    await toAudience();
    fireEvent.click(screen.getByLabelText('Platform'));
    expect(await screen.findByText('Counting the people on your teams…')).toBeTruthy();
    next();
    expect(problem()?.textContent).toMatch(/Counting the people/);
    release([]);
    expect(await screen.findByText(/2 people will be assigned/)).toBeTruthy();
  });

  it('searches teams and shows ten at a time', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `t${i}`,
      name: `Team ${String(i).padStart(2, '0')}`,
      memberEmails: [],
      createdAt: i,
    }));
    await open(setup({ teamList: many }));
    await toAudience();
    expect(screen.getByText('Showing 10 of 12 teams')).toBeTruthy();
    expect(screen.queryByLabelText('Team 11')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show 2 more' }));
    expect(screen.getByLabelText('Team 11')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search teams' }), {
      target: { value: 'team 03' },
    });
    expect(screen.getByText('1 team matches of 12')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search teams' }), {
      target: { value: 'team' },
    });
    expect(screen.getByText('12 teams match of 12')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search teams' }), {
      target: { value: 'nope' },
    });
    expect(await screen.findByRole('heading', { name: 'No team matches “nope”' })).toBeTruthy();
  });

  it('says there are no teams, and points to New team', async () => {
    await open(setup({ teams: [] }));
    await toAudience();
    expect(await screen.findByRole('heading', { name: 'No teams yet' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'New team' }));
    expect(screen.queryByRole('heading', { name: 'No teams yet' })).toBeNull();
  });

  it('offers Retry when the team list fails', async () => {
    const c = setup();
    c.data.teamList = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue([]);
    await open(c);
    await toAudience();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'No teams yet' })).toBeTruthy();
  });

  it('makes a new team on the spot and picks it', async () => {
    const c = setup({ teams: [] });
    await open(c);
    await toAudience();
    await screen.findByRole('heading', { name: 'No teams yet' });
    fireEvent.click(screen.getByRole('button', { name: 'New team' }));
    fireEvent.change(screen.getByLabelText('Team name'), { target: { value: 'Mobile' } });
    const members = screen.getByRole('combobox', { name: 'Members' });
    fireEvent.change(members, { target: { value: 'a@nonstopio.com' } });
    fireEvent.keyDown(members, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
    expect(
      await screen.findByText(/1 person will be assigned\. From 1 team: Mobile\./),
    ).toBeTruthy();
    expect(c.data.saveTeam).toHaveBeenCalledWith(
      {
        id: 'mobile',
        name: 'Mobile',
        memberEmails: ['a@nonstopio.com'],
        createdAt: expect.any(Number),
      },
      null,
    );
    expect(screen.queryByLabelText('Team name')).toBeNull();
    expect((screen.getByLabelText('Mobile') as HTMLInputElement).checked).toBe(true);
  });

  it('refuses a team name that is taken, too alike or too many people, and can be cancelled', async () => {
    const c = setup({ teams: ['QA'] });
    await open(c);
    await toAudience();
    fireEvent.click(await screen.findByRole('button', { name: 'New team' }));
    const name = screen.getByLabelText('Team name');
    const create = () => fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
    fireEvent.change(name, { target: { value: 'QA' } });
    create();
    expect(problem()?.textContent).toMatch(/QA/);
    fireEvent.change(name, { target: { value: 'QA!' } });
    create();
    expect(problem()?.textContent).toBe(
      'A team with a very similar name exists. Use a different name.',
    );
    fireEvent.change(name, { target: { value: 'Huge' } });
    create();
    expect(problem()?.textContent).toBe('Add at least one member.');
    const members = screen.getByRole('combobox', { name: 'Members' });
    fireEvent.change(members, { target: { value: 'nobody' } });
    fireEvent.keyDown(members, { key: 'Enter' });
    create();
    expect(problem()?.textContent).toBe('Fix or remove the addresses marked rejected.');
    fireEvent.click(screen.getByRole('button', { name: 'Remove nobody' }));
    fireEvent.paste(members, {
      clipboardData: {
        getData: () => Array.from({ length: 501 }, (_, i) => `p${i}@nonstopio.com`).join(' '),
      },
    });
    create();
    expect(problem()?.textContent).toBe('A team holds at most 500 people.');
    expect(c.data.saveTeam).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Team name')).toBeNull();
  });

  it('keeps the form and says so when the team cannot be saved', async () => {
    const c = setup({ teams: [] });
    c.data.saveTeam = vi.fn().mockRejectedValue(new Error('x'));
    await open(c);
    await toAudience();
    fireEvent.click(await screen.findByRole('button', { name: 'New team' }));
    fireEvent.change(screen.getByLabelText('Team name'), { target: { value: 'Mobile' } });
    const members = screen.getByRole('combobox', { name: 'Members' });
    fireEvent.change(members, { target: { value: 'a@nonstopio.com' } });
    fireEvent.keyDown(members, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
    expect(await screen.findByText('Could not create the team. Try again.')).toBeTruthy();
    expect(screen.getByLabelText('Team name')).toBeTruthy();
  });
});

describe('Assign: switching between teams and people', () => {
  it('switches at once when nothing is picked, and ignores the side already shown', async () => {
    await open(setup({ teamList: [PLATFORM] }));
    await toAudience();
    teamsTab();
    expect(screen.queryByRole('dialog')).toBeNull();
    people();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Add people' })).toBeTruthy();
    teamsTab();
    expect(screen.getByRole('searchbox', { name: 'Search teams' })).toBeTruthy();
  });

  it('asks before it clears teams that were picked, and keeps them on cancel', async () => {
    await open(setup({ teamList: [PLATFORM, QA] }));
    await toAudience();
    fireEvent.click(screen.getByLabelText('Platform'));
    fireEvent.click(screen.getByLabelText('QA'));
    people();
    const dialog = screen.getByRole('dialog', { name: 'Switch to people?' });
    expect(dialog.textContent).toContain('You picked 2 teams.');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    people();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Keep teams' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((screen.getByLabelText('Platform') as HTMLInputElement).checked).toBe(true);
    people();
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Switch to people' }),
    );
    expect(screen.getByRole('combobox', { name: 'Add people' })).toBeTruthy();
    expect(screen.getByText(/0 people will be assigned/)).toBeTruthy();
  });

  it('asks before it clears people that were picked', async () => {
    await open(setup());
    await toAudience();
    people();
    await addEmails('a@nonstopio.com');
    await screen.findByText(/1 person will be assigned/);
    teamsTab();
    expect(
      within(screen.getByRole('dialog', { name: 'Switch to teams?' })).getByText(
        /You picked 1 person\./,
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Switch to teams' }));
    expect(screen.getByRole('searchbox', { name: 'Search teams' })).toBeTruthy();
    expect(screen.getByText(/0 people will be assigned/)).toBeTruthy();
  });
});

describe('Assign: schedule and review', () => {
  it('assigns with the deadline, reminder and toggles, then shows the success state', async () => {
    const c = setup();
    const { container } = await open(c);
    await pick(/Git, the NonStop Way/);
    next();
    await heading('Who is it for?');
    people();
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
    expect((screen.getByRole('combobox', { name: 'Add people' }) as HTMLElement).isConnected).toBe(
      true,
    );
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
    people();
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
    people();
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
