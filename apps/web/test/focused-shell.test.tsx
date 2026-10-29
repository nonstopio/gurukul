import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { axeViolations } from './axe';
import { fakeData, progressRow } from './fake-data';
import { attemptResult } from './fake-quiz';
import { openApp } from './harness';

const progress = () =>
  fakeData({
    watched: progressRow({ completedItemIds: ['l1', 'l2', 'l3'], lastItemId: 'l4' }),
  });
const headings = () => screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent);

// Lazy routes: load them first so a busy machine's first transform does not eat a test's wait.
beforeAll(() =>
  Promise.all([import('../src/LessonPage'), import('../src/quiz/QuizPage')]).then(
    () => import('../src/quiz/ResultPage'),
  ),
);

describe('focused shell', () => {
  it('gives the lesson the top bar alone, one h1, and progress as "60% · 3 / 5"', async () => {
    const { container } = await openApp('/courses/git/learn/l3', { data: progress() });
    await screen.findByRole('heading', { level: 1, name: 'Lesson l3' });
    expect(headings()).toEqual(['Lesson l3']);
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
    expect(screen.getByRole('banner').textContent).toContain('Git, the NonStop Way');
    expect(screen.getByText('60% · 3 / 5')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('keeps one h1 on a locked lesson', async () => {
    await openApp('/courses/git/learn/l4');
    await screen.findByText('Locked for now');
    expect(headings()).toEqual(['Lesson l4']);
  });

  it('gives the Quiz the top bar alone and its title as the one h1', async () => {
    await openApp('/courses/git/quiz/q1', { data: progress() });
    await screen.findByText('Question 1 of 1');
    expect(headings()).toEqual(['Quiz I']);
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
    expect(screen.getByRole('banner').textContent).toContain('Git, the NonStop Way');
  });

  it('keeps one h1 on a Quiz that is not open yet', async () => {
    await openApp('/courses/git/quiz/q1');
    await screen.findByText('Locked for now');
    expect(headings()).toEqual(['Quiz I']);
  });

  it('gives the result the top bar, with the way back to the outline', async () => {
    await openApp(
      {
        pathname: '/courses/git/quiz/q1/result',
        state: { result: attemptResult(), questions: [], answers: {} },
      },
      { data: progress() },
    );
    await screen.findByRole('heading', { level: 1, name: 'Quiz I cleared.' });
    expect(headings()).toEqual(['Quiz I cleared.']);
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Course outline' }).getAttribute('href')).toBe(
      '/courses/git',
    );
  });

  it('keeps the sidebar on the course outline', async () => {
    await openApp('/courses/git');
    await screen.findByRole('heading', { level: 1, name: 'Git, the NonStop Way' });
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy();
  });

  it('moves focus to the lesson heading when the outline opens a lesson', async () => {
    const { router } = await openApp('/courses/git', { data: progress() });
    await screen.findByRole('heading', { level: 1, name: 'Git, the NonStop Way' });
    await act(() => router.navigate('/courses/git/learn/l3'));
    const heading = await screen.findByRole('heading', { level: 1, name: 'Lesson l3' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe('Lesson l3');
  });

  it('skips to the lesson heading', async () => {
    await openApp('/courses/git/learn/l3', { data: progress() });
    const heading = await screen.findByRole('heading', { level: 1, name: 'Lesson l3' });
    fireEvent.click(screen.getByRole('link', { name: 'Skip to content' }));
    expect(document.activeElement).toBe(heading);
  });
});
