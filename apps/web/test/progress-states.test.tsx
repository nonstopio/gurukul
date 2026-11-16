import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { log } from '../src/log';
import { fakeData, progressRow } from './fake-data';
import { openApp } from './harness';

const midway = progressRow({ completedItemIds: ['l1', 'l2', 'l3'], lastItemId: 'l3' });
const finished = progressRow({
  completedItemIds: ['l1', 'l2', 'l3', 'q1', 'l4'],
  quiz: { q1: { best: 1, passed: true, attempts: 1, lastAttemptAt: new Date() } },
  percent: 100,
  completedAt: new Date('2026-11-09T00:00:00Z'),
});

/** Every page that draws from the learner's progress, and what it shows once progress is in. */
const PAGES = [
  { name: 'course overview', path: '/courses/git', progress: midway, ready: 'Resume' },
  { name: 'late lesson', path: '/courses/git/learn/l4', progress: midway, ready: 'Lesson l4' },
  { name: 'Quiz', path: '/courses/git/quiz/q1', progress: midway, ready: 'Quiz I' },
  {
    name: 'Quiz result',
    path: '/courses/git/quiz/q1/result',
    progress: midway,
    ready: 'Course outline',
  },
  {
    name: 'completion',
    path: '/courses/git/complete',
    progress: finished,
    ready: 'Course complete',
  },
];

/** Waits until the course itself has loaded, so only the progress is still pending. */
async function courseLoaded(d: ReturnType<typeof fakeData>) {
  await waitFor(() => expect(d.data.watchProgress).toHaveBeenCalled());
  await act(async () => {
    await vi.mocked(d.data.getCourse).mock.results[0]?.value;
  });
}

describe.each(PAGES)('the $name page and its progress', ({ path, progress, ready }) => {
  it('shows a skeleton, never 0%, Start or Locked, until progress arrives', async () => {
    const d = fakeData({ deferProgress: true });
    await openApp(path, { data: d });
    await courseLoaded(d);
    expect(screen.getByText('Loading')).toBeTruthy();
    expect(screen.queryByText('0%')).toBeNull();
    expect(screen.queryByText('Start course')).toBeNull();
    expect(screen.queryByText('Locked for now')).toBeNull();
    expect(screen.queryByText('Finishing up…')).toBeNull();
    act(() => d.emitProgress(progress));
    expect((await screen.findAllByText(ready)).length).toBeGreaterThan(0);
    expect(screen.queryByText('Loading')).toBeNull();
  });

  it('says a failed progress read did not load, logs it once, and Retry listens again', async () => {
    const error = vi.spyOn(log, 'error').mockImplementation(() => {});
    try {
      const d = fakeData({ deferProgress: true });
      await openApp(path, { data: d });
      await courseLoaded(d);
      act(() => d.failProgress());
      expect(await screen.findByText('This did not load')).toBeTruthy();
      expect(screen.queryByText('Finishing up…')).toBeNull();
      const failures = error.mock.calls.filter(([event]) => event === 'Progress listener failed');
      expect(failures).toHaveLength(1);
      expect(failures[0]?.[2]).toEqual({ courseId: 'git' });
      const listens = vi.mocked(d.data.watchProgress).mock.calls.length;
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      await waitFor(() =>
        expect(vi.mocked(d.data.watchProgress).mock.calls.length).toBe(listens + 1),
      );
      expect(screen.getByText('Loading')).toBeTruthy();
      act(() => d.emitProgress(progress));
      expect((await screen.findAllByText(ready)).length).toBeGreaterThan(0);
      expect(screen.queryByText('This did not load')).toBeNull();
    } finally {
      error.mockRestore();
    }
  });
});
