import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeContinue, useAnimatedPercent } from '../src/learn/HomeContinue';
import { axeViolations } from './axe';
import { makeCourse, progressRow } from './fake-data';

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

const asAssigned = (title: string) => ({
  assignment: {
    id: 'a',
    courseId: 'sql',
    dueAt: null,
    mandatory: false,
    status: 'assigned' as const,
    assignedByName: null,
  },
  course: makeCourse({ id: 'sql', title }),
  progress: null,
});

const view = (over: Partial<Parameters<typeof HomeContinue>[0]> = {}) =>
  render(
    <MemoryRouter>
      <HomeContinue
        course={makeCourse()}
        progress={progressRow({ completedItemIds: ['l1'] })}
        percent={25}
        due={null}
        assignedBy={null}
        next={null}
        nextDue={null}
        {...over}
      />
    </MemoryRouter>,
  );

describe('HomeContinue', () => {
  it('shows the ring, the next lesson with its length, the time left and one Resume link', async () => {
    const { container } = view({
      due: { text: 'Due in 2 days', overdue: false },
      assignedBy: 'Kavya Rao',
      next: asAssigned('SQL basics'),
      nextDue: { text: 'Overdue by 1 day', overdue: true },
    });
    expect(screen.getByRole('progressbar', { name: 'Course progress' })).toBeTruthy();
    expect(screen.getByText(/Next lesson:/).textContent).toContain('Lesson l2 · 5 min');
    expect(screen.getByText('15 min left')).toBeTruthy();
    expect(screen.getByText(/Assigned by Kavya Rao/)).toBeTruthy();
    expect(screen.getByText('Due in 2 days')).toBeTruthy();
    expect(screen.getByText('Overdue by 1 day')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'SQL basics' }).getAttribute('href')).toBe(
      '/courses/sql',
    );
    expect(screen.getAllByRole('link', { name: 'Resume lesson' })).toHaveLength(1);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('names a Quiz as the next item, a retired course, and a course with only Quizzes left', () => {
    const done = progressRow({ completedItemIds: ['l1', 'l2', 'l3', 'l4'] });
    view({
      course: makeCourse({ status: 'archived' }),
      progress: progressRow({ completedItemIds: ['l1', 'l2', 'l3'] }),
      due: { text: 'Overdue by 3 days', overdue: true },
    });
    expect(screen.getByText(/Next item:/)).toBeTruthy();
    expect(screen.getByText('Retired')).toBeTruthy();
    expect(screen.getByText('Overdue by 3 days')).toBeTruthy();
    view({
      progress: done,
      next: asAssigned('Go'),
      nextDue: { text: 'Due in 5 days', overdue: false },
    });
    expect(screen.getByText('Due in 5 days')).toBeTruthy();
    view({ next: asAssigned('Plain') });
    expect(screen.getByRole('link', { name: 'Plain' })).toBeTruthy();
    expect(screen.getByText('Nothing left but the Quizzes')).toBeTruthy();
  });
});

describe('useAnimatedPercent', () => {
  const Probe = ({ value }: { value: number }) => <p>{useAnimatedPercent('git', value)}</p>;
  const frames = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))));

  it('starts from what this browser last showed, then moves to the new value', async () => {
    window.localStorage.setItem('gurukul.ring.git', '20');
    render(<Probe value={60} />);
    expect(screen.getByText('20')).toBeTruthy();
    await frames();
    expect(screen.getByText('60')).toBeTruthy();
    expect(window.localStorage.getItem('gurukul.ring.git')).toBe('60');
  });

  it('starts from zero the first time, and works when storage is refused', async () => {
    const refuse = () => {
      throw new Error('blocked');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(refuse);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(refuse);
    render(<Probe value={40} />);
    expect(screen.getByText('0')).toBeTruthy();
    await frames();
    expect(screen.getByText('40')).toBeTruthy();
  });
});
