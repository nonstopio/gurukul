import type { Course } from '@gurukul/schema';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeConsole } from './fake-console';
import { fakeData, makeCourse } from './fake-data';
import { draftDoc, fakeStudio } from './fake-studio';
import { openApp } from './harness';

const mine = (over: Partial<Course> = {}) =>
  makeCourse({ educatorIds: ['u1'], version: 3, ...over });

async function openEditor(live: Course = mine(), draft: Course | null = live) {
  const studio = fakeStudio({ draft: draft ? draftDoc(draft, { rev: 5 }) : null });
  await openApp(`/studio/courses/${live.id}`, {
    roles: ['educator'],
    studio,
    data: fakeData({ courses: [live] }),
    console: fakeConsole(),
    labels: 'gurukul',
  });
}

const gurukul = (path: string, studio: ReturnType<typeof fakeStudio>) =>
  openApp(path, { roles: ['educator'], studio, labels: 'gurukul' });

describe('Studio in Gurukul names', () => {
  it('names the courses page and its cards', async () => {
    const live = mine({ educatorIds: ['u1'] });
    await gurukul('/studio', fakeStudio({ courses: [{ live, draft: null, learners: 1 }] }));
    expect(await screen.findByText('Build courses Parva by Parva.')).toBeTruthy();
    expect(await screen.findByText('1 Shishya')).toBeTruthy();
    expect(screen.getByText(/2 Parvas · 4 lessons · 1 Parikshas/)).toBeTruthy();
  });

  it('names the view-only notice', async () => {
    await openEditor(mine({ educatorIds: ['x', 'y'], educatorNames: { x: 'Rohan Das' } }));
    expect(await screen.findByText(/Ask a Kulapati for edit access\./)).toBeTruthy();
    expect(screen.getByText('Acharyas: Rohan Das, 1 other.')).toBeTruthy();
  });

  it('names a missing draft', async () => {
    await openEditor(mine(), null);
    expect(await screen.findByText(/Ask a Kulapati to check it\./)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to Vyasa Studio' })).toBeTruthy();
  });

  it('names the structure, details, landing, analytics, versions and publish screens', async () => {
    await openEditor();
    expect(await screen.findByRole('button', { name: 'Add Parva' })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Vyasa Studio' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Preview as Shishya' })).toBeTruthy();
    expect(screen.getByText(/A Kulapati changes this list in the console\./)).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Shishyas go in order' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Landing page' }));
    expect(
      await screen.findByRole('heading', { name: 'What Shishyas will be able to do' }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Certificate' }));
    expect(await screen.findByText(/set by a Kulapati in Org settings/)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Analytics' }));
    expect(await screen.findByRole('heading', { name: 'Shishyas' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Versions' }));
    expect(await screen.findByText('No earlier versions')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Publish v4' }));
    expect(await screen.findByRole('heading', { name: 'What changes for Shishyas' })).toBeTruthy();
  });

  it('names an empty course outline', async () => {
    await openEditor(mine({ chapters: [] }));
    expect(await screen.findByText('Start with a Parva')).toBeTruthy();
  });

  it('names the lesson editor, Quiz builder, preview and question bank', async () => {
    const draft = draftDoc(makeCourse());
    await gurukul('/studio/courses/git/lessons/l1', fakeStudio({ draft }));
    expect(await screen.findByRole('heading', { name: 'Lessons and Parikshas' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'The Shishya marks it done' })).toBeTruthy();

    await gurukul('/studio/courses/git/quiz/q1', fakeStudio({ draft }));
    expect(await screen.findByRole('region', { name: 'Pariksha settings' })).toBeTruthy();
    expect(
      screen.getByRole('switch', { name: 'Shishyas must pass to open the next Parva' }),
    ).toBeTruthy();

    await gurukul('/studio/courses/git/preview/l1', fakeStudio({ draft }));
    expect(
      await screen.findByText(
        'This is your draft as a Shishya would see it. Nothing you do here is recorded.',
      ),
    ).toBeTruthy();

    await gurukul('/studio/bank', fakeStudio());
    expect(await screen.findByText(/drop into any Pariksha, so you never retype/)).toBeTruthy();
  });

  it('names who may edit a missing draft', async () => {
    await gurukul('/studio/courses/git/lessons/l1', fakeStudio({ draft: null }));
    expect(
      await screen.findByText('It may not exist, or you may not be one of its Acharyas.'),
    ).toBeTruthy();
  });
});
