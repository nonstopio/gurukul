import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeConsole } from './fake-console';
import { fakeData, makeCourse } from './fake-data';
import { openApp } from './harness';

const admin = { roles: ['admin'] as Array<'admin'> };

describe('Overview: course funnel', () => {
  it('shows 25 courses a page', async () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      makeCourse({ id: `c${i}`, title: `Course ${String(i).padStart(2, '0')}` }),
    );
    await openApp('/admin', { ...admin, data: fakeData({ courses: many }) });
    expect(await screen.findByRole('link', { name: 'Course 00' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Course 25' })).toBeNull();
    expect(screen.getByText('Showing 1–25 of 30')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('link', { name: 'Course 25' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Course 00' })).toBeNull();
  });

  it('shows no pager when there are no courses', async () => {
    await openApp('/admin', { ...admin, data: fakeData({ courses: [] }) });
    expect(await screen.findByText('No courses yet')).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Courses' })).toBeNull();
  });
});

describe('Course analytics: Quizzes', () => {
  const quiz = (i: number) => ({
    type: 'quiz' as const,
    id: `q${i}`,
    title: `Quiz ${String(i).padStart(2, '0')}`,
    questionsShown: 1,
    shuffleOptions: false,
    cooldownMinutes: 0,
    revealAnswers: 'each' as const,
    blocksNext: true,
    questions: [
      {
        id: `k${i}`,
        kind: 'single' as const,
        prompt: 'Which?',
        options: [
          { id: 'a', text: 'A' },
          { id: 'b', text: 'B' },
        ],
        explanation: 'Because',
      },
    ],
  });
  const withQuizzes = (n: number) =>
    makeCourse({
      chapters: [{ id: 'p', title: 'P', items: Array.from({ length: n }, (_, i) => quiz(i)) }],
    });

  it('shows 25 Quizzes a page', async () => {
    const data = fakeData({ courses: [withQuizzes(30)] });
    await openApp('/admin/courses/git', { ...admin, data, console: fakeConsole() });
    expect(await screen.findByText('Quiz 00')).toBeTruthy();
    expect(screen.queryByText('Quiz 29')).toBeNull();
    expect(screen.getByText('Showing 1–25 of 30')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Quiz 29')).toBeTruthy();
    expect(screen.queryByText('Quiz 00')).toBeNull();
  });

  it('shows no pager for a course without a Quiz', async () => {
    const data = fakeData({ courses: [withQuizzes(0)] });
    await openApp('/admin/courses/git', { ...admin, data, console: fakeConsole() });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Git, the NonStop Way' }),
    ).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Quizzes' })).toBeNull();
  });
});
