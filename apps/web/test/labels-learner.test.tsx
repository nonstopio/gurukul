import { fireEvent, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { fakeData, makeCourse, progressRow } from './fake-data';
import { openApp } from './harness';

const labels = 'gurukul' as const;
const started = (over = {}) => progressRow({ lastItemId: 'l1', ...over });

beforeAll(() =>
  Promise.all([
    import('../src/quiz/QuizPage'),
    import('../src/quiz/ResultPage'),
    import('../src/certificates/pages'),
    import('../src/LessonPage'),
  ]),
);

describe('learner screens in Gurukul names', () => {
  it('Home: kicker, status line and team prompt', async () => {
    const watched = started({ completedItemIds: ['l1'] });
    await openApp('/', {
      labels,
      data: fakeData({ progress: [watched], teams: ['Mobile'] }),
    });
    expect(await screen.findByText('Shishya · My learning')).toBeTruthy();
    expect(await screen.findByText(/left to finish the Basics Parva\./)).toBeTruthy();
    expect(
      await screen.findByText('Your Kulapati uses it to assign courses to a whole team.'),
    ).toBeTruthy();
  });

  it('catalogue and course overview', async () => {
    const { unmount } = await openApp('/courses', { labels });
    expect(await screen.findByText(/1 Parikshas ·/)).toBeTruthy();
    unmount();
    const course = makeCourse({ status: 'archived', educatorNames: { a1: 'Asha Rao' } });
    await openApp('/courses/git', { labels, data: fakeData({ courses: [course] }) });
    expect(await screen.findByText(/2 Parvas · 4 lessons · 1 Parikshas/)).toBeTruthy();
    expect(screen.getAllByText('Parva 1').length).toBeGreaterThan(0);
    expect(screen.getByText('Pass mark 70% on each Pariksha.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Your Acharya' })).toBeTruthy();
    expect(screen.getByText(/Its Parikshas are closed/)).toBeTruthy();
  });

  it('lesson player and a locked lesson', async () => {
    const { unmount } = await openApp('/courses/git/learn/l1', {
      labels,
      data: fakeData({ watched: started() }),
    });
    expect(await screen.findByText(/Parva 1 · Lesson 1 of 2/)).toBeTruthy();
    unmount();
    await openApp('/courses/git/learn/l4', {
      labels,
      data: fakeData({ watched: started({ completedItemIds: ['l1', 'l2'] }) }),
    });
    expect(
      await screen.findByText(
        'Finish the earlier items, and pass any Pariksha before this one, to open it.',
      ),
    ).toBeTruthy();
  });

  it('Quiz, result and leave dialog', async () => {
    const watched = started({ completedItemIds: ['l1', 'l2', 'l3'], lastItemId: 'l3' });
    const { unmount } = await openApp('/courses/git/quiz/q1', {
      labels,
      data: fakeData({ watched }),
    });
    expect(await screen.findByRole('link', { name: 'Exit Pariksha' })).toBeTruthy();
    unmount();
    await openApp('/courses/git/quiz/nope/result', { labels, data: fakeData() });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'This Pariksha does not exist.' }),
    ).toBeTruthy();
  });

  it('certificates and the completion screen', async () => {
    const { unmount } = await openApp('/certificates', { labels });
    expect(
      await screen.findByText('Finish a course and pass its Parikshas to earn one.'),
    ).toBeTruthy();
    unmount();
    const second = await openApp('/courses/git/complete', { labels });
    expect(
      await screen.findByText(
        'Finish every lesson and pass every Pariksha to complete the course.',
      ),
    ).toBeTruthy();
    second.unmount();
    const done = progressRow({
      completedItemIds: ['l1', 'l2', 'l3', 'q1', 'l4'],
      quiz: { q1: { best: 0.9, passed: true, attempts: 1, lastAttemptAt: null } },
      percent: 100,
      completedAt: new Date('2026-11-09T00:00:00Z'),
    });
    await openApp('/courses/git/complete', { labels, data: fakeData({ watched: done }) });
    expect(await screen.findByText('Pariksha average')).toBeTruthy();
  });

  it('not-allowed page and the shortcuts dialog', async () => {
    await openApp('/admin', { labels });
    expect(await screen.findByText(/Ask a Kulapati if you need it/)).toBeTruthy();
    fireEvent.keyDown(window, { key: '?' });
    expect(screen.getByRole('dialog').textContent).toContain('In a Pariksha');
  });
});
