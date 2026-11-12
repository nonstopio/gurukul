import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Course, CourseAccess } from '@gurukul/schema';
import { MAX_VISIBLE_TEAMS, teamId } from '@gurukul/schema';
import { log } from '../src/log';
import { axeViolations } from './axe';
import { fakeData, makeCourse } from './fake-data';
import { draftDoc, fakeStudio } from './fake-studio';
import { openApp } from './harness';
import { choose } from './select';

vi.mock('../src/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const PUBLIC: CourseAccess = { visibility: 'public', visibleTeamIds: [] };

async function open({
  live = makeCourse({ educatorIds: ['u1'], version: 3 }),
  access = PUBLIC,
  teams = ['Platform', 'QA Guild'],
  studio = fakeStudio({ draft: draftDoc(live, { rev: 5 }) }),
  data = fakeData({ courses: [live], teams }),
}: {
  live?: Course;
  access?: CourseAccess;
  teams?: string[];
  studio?: ReturnType<typeof fakeStudio>;
  data?: ReturnType<typeof fakeData>;
} = {}) {
  vi.mocked(studio.data.getAccess).mockResolvedValue(access);
  await openApp(`/studio/courses/${live.id}`, { roles: ['educator'], studio, data });
  const card = await screen.findByRole('region', { name: 'Who can open this course' });
  return { studio, data, card };
}

const save = (card: HTMLElement) =>
  within(card).getByRole('button', { name: 'Save who can open' }) as HTMLButtonElement;

describe('Who can open this course', () => {
  it('changes visibility on the live course without publishing a new version', async () => {
    const { studio, card } = await open();
    const select = await within(card).findByLabelText('Visibility');
    expect(within(card).getByText(/without publishing a new version/)).toBeTruthy();
    expect(
      within(card).getByText('Every signed-in learner sees it in the catalogue.'),
    ).toBeTruthy();
    expect(save(card).disabled).toBe(true);
    choose(select, 'Educators and Admins');
    expect(
      within(card).getByText('Only educators and Admins see it; learners do not.'),
    ).toBeTruthy();
    expect(save(card).disabled).toBe(false);
    expect(await axeViolations(document.body)).toEqual([]);
    await act(async () => {
      fireEvent.click(save(card));
    });
    expect(studio.service.setCourseAccess).toHaveBeenCalledWith({
      courseId: 'git',
      visibility: 'staff',
      visibleTeamIds: [],
    });
    expect(studio.service.publishCourse).not.toHaveBeenCalled();
    expect(await screen.findByText('Saved. It applies to the live course now.')).toBeTruthy();
    expect(save(card).disabled).toBe(true);
  });

  it('needs a team for team visibility, and compares picks in any order', async () => {
    const { studio, card } = await open({
      access: { visibility: 'teams', visibleTeamIds: ['qa-guild', 'platform'] },
    });
    await within(card).findByLabelText('Visibility');
    const team = (name: string) => within(card).getByRole('checkbox', { name });
    expect(within(card).getByText(`Teams (up to ${MAX_VISIBLE_TEAMS})`)).toBeTruthy();
    // Unpicked and picked again: the same teams, so nothing to save.
    fireEvent.click(team('QA Guild'));
    expect(save(card).disabled).toBe(false);
    fireEvent.click(team('QA Guild'));
    expect(save(card).disabled).toBe(true);
    fireEvent.click(team('QA Guild'));
    fireEvent.click(team('Platform'));
    expect(within(card).getByRole('alert').textContent).toBe(
      'Pick at least one team, or choose another visibility.',
    );
    expect(save(card).disabled).toBe(true);
    fireEvent.click(team('Platform'));
    await act(async () => {
      fireEvent.click(save(card));
    });
    expect(studio.service.setCourseAccess).toHaveBeenCalledWith({
      courseId: 'git',
      visibility: 'teams',
      visibleTeamIds: ['platform'],
    });
    // Leaving team visibility drops the picks.
    choose(within(card).getByLabelText('Visibility'), 'Public');
    choose(within(card).getByLabelText('Visibility'), 'Team only');
    expect((team('Platform') as HTMLInputElement).checked).toBe(false);
  });

  it('stops offering teams past the most one course can list', async () => {
    const teams = Array.from({ length: MAX_VISIBLE_TEAMS + 1 }, (_, i) => `Team ${i}`);
    const { card } = await open({
      teams,
      access: {
        visibility: 'teams',
        visibleTeamIds: teams.slice(0, MAX_VISIBLE_TEAMS).map(teamId),
      },
    });
    await within(card).findByLabelText('Visibility');
    const last = within(card).getByRole('checkbox', { name: `Team ${MAX_VISIBLE_TEAMS}` });
    expect((last as HTMLInputElement).disabled).toBe(true);
    expect(
      (within(card).getByRole('checkbox', { name: 'Team 0' }) as HTMLInputElement).disabled,
    ).toBe(false);
  });

  it('says where teams are made when there are none, or they cannot be read', async () => {
    const live = makeCourse({ educatorIds: ['u1'], version: 3 });
    const data = fakeData({ courses: [live] });
    data.data.orgTeams = vi.fn().mockRejectedValue(new Error('x'));
    const { card } = await open({
      live,
      data,
      access: { visibility: 'teams', visibleTeamIds: ['x'] },
    });
    expect(
      await within(card).findByText('Teams are made in Studio, under Teams. Then pick them here.'),
    ).toBeTruthy();
    expect(within(card).queryByRole('group')).toBeNull();
    expect(log.warn).toHaveBeenCalledWith('Reading the team list failed', { courseId: 'git' });
  });

  it('keeps it for the first publish of a course never published', async () => {
    const live = makeCourse({ educatorIds: ['u1'], version: 0, status: 'draft' });
    const { studio, card } = await open({ live });
    choose(await within(card).findByLabelText('Visibility'), 'Educators and Admins');
    expect(within(card).getByText(/takes effect when the course is first published/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(save(card));
    });
    expect(studio.service.setCourseAccess).toHaveBeenCalled();
    expect(
      await screen.findByText('Saved. It applies when the course is first published.'),
    ).toBeTruthy();
  });

  it('keeps a choice changed while the save was on its way, still unsaved', async () => {
    const studio = fakeStudio({ draft: draftDoc(makeCourse({ educatorIds: ['u1'], version: 3 })) });
    let finish: (access: CourseAccess) => void = () => {};
    studio.service.setCourseAccess = vi.fn(
      () => new Promise<CourseAccess>((resolve) => (finish = resolve)),
    );
    const { card } = await open({ studio });
    const select = await within(card).findByLabelText('Visibility');
    choose(select, 'Educators and Admins');
    act(() => {
      fireEvent.click(save(card));
    });
    choose(within(card).getByLabelText('Visibility'), 'Public');
    choose(within(card).getByLabelText('Visibility'), 'Team only');
    await act(async () => finish({ visibility: 'staff', visibleTeamIds: [] }));
    expect(await screen.findByText('Saved. It applies to the live course now.')).toBeTruthy();
    // Still the newer choice, and Save is offered for it (once a team is picked).
    expect(within(card).getByLabelText('Visibility').textContent).toContain('Team only');
    fireEvent.click(within(card).getByRole('checkbox', { name: 'Platform' }));
    expect(save(card).disabled).toBe(false);
  });

  it('shows a failed save and lets it be tried again', async () => {
    const live = makeCourse({ educatorIds: ['u1'], version: 3 });
    const studio = fakeStudio({ draft: draftDoc(live, { rev: 5 }) });
    studio.service.setCourseAccess = vi.fn().mockRejectedValue(new Error('x'));
    const { card } = await open({ live, studio });
    choose(await within(card).findByLabelText('Visibility'), 'Educators and Admins');
    await act(async () => {
      fireEvent.click(save(card));
    });
    expect(
      await screen.findByText("Couldn't change who can open the course. Try again."),
    ).toBeTruthy();
    expect(log.error).toHaveBeenCalledWith(
      'Changing who can open a course failed',
      expect.any(Error),
      { courseId: 'git' },
    );
    expect(save(card).disabled).toBe(false);
  });

  it('offers Retry when who can open it cannot be read', async () => {
    const live = makeCourse({ educatorIds: ['u1'], version: 3 });
    const studio = fakeStudio({ draft: draftDoc(live, { rev: 5 }) });
    vi.mocked(studio.data.getAccess).mockRejectedValue(new Error('x'));
    await openApp(`/studio/courses/${live.id}`, {
      roles: ['educator'],
      studio,
      data: fakeData({ courses: [live] }),
    });
    const card = await screen.findByRole('region', { name: 'Who can open this course' });
    expect(await within(card).findByText('This did not load')).toBeTruthy();
    vi.mocked(studio.data.getAccess).mockResolvedValue(PUBLIC);
    fireEvent.click(within(card).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(within(card).getByLabelText('Visibility')).toBeTruthy());
  });
});
