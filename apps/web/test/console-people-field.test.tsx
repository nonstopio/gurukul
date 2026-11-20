import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PeopleField } from '../src/console/PeopleField';
import type { UserRow } from '../src/console/types';

const asha: UserRow = {
  uid: 'asha',
  email: 'asha@nonstopio.com',
  displayName: 'Asha Rao',
  teamIds: [],
  roles: ['learner'],
  grantedCourseIds: [],
  createdAt: null,
};

/**
 * Counts React state updates scheduled while it runs: React reads `window.event` to pick the
 * priority of an update made outside an event handler. That read is what threw on CI when a late
 * answer arrived after the test environment had removed `window`. React's Scheduler tasks read it
 * too, so `run` must not wait for a timer: a task an earlier test left queued would run there and
 * be counted (as in `packages/ui/test/people-picker.test.tsx`, which failed that way on CI).
 */
async function updatesDuring(run: () => Promise<void>): Promise<number> {
  let reads = 0;
  Object.defineProperty(window, 'event', {
    configurable: true,
    get: () => {
      reads += 1;
      return undefined;
    },
  });
  try {
    await run();
  } finally {
    delete (window as { event?: unknown }).event;
  }
  return reads;
}

/**
 * How many microtasks an answer is let through: it passes the lookup's, the field's and the
 * picker's awaits. Microtasks only, never a timer, so React work left queued cannot run in the
 * count; the control in the test below shows this is enough for the answer to reach the picker.
 */
const HOPS = 10;

describe('PeopleField', () => {
  // This test runs first on purpose: it leaves React work queued that a count waiting on a timer
  // would see (the next test, counting that way, failed when it came second: "expected 1 to be 0").
  it('shows the name of someone picked from the list on their chip', async () => {
    const data = {
      searchUsers: vi.fn().mockResolvedValue([]),
      usersPage: vi.fn().mockResolvedValue({ rows: [asha], nextCursor: null }),
      userCount: vi.fn().mockResolvedValue(1),
    };
    const onEmails = vi.fn();
    const { rerender } = render(
      <PeopleField data={data as never} label="People" emails={[]} onEmails={onEmails} />,
    );
    fireEvent.focus(screen.getByRole('combobox', { name: 'People' }));
    fireEvent.mouseDown(await screen.findByRole('option', { name: /Asha Rao/ }));
    expect(onEmails).toHaveBeenCalledWith(['asha@nonstopio.com']);
    rerender(
      <PeopleField
        data={data as never}
        label="People"
        emails={['asha@nonstopio.com']}
        onEmails={onEmails}
      />,
    );
    expect(screen.getByRole('button', { name: 'Remove Asha Rao' })).toBeTruthy();
  });

  it('drops a lookup that answers after the field has gone', async () => {
    // Typing waits for a pause before it searches, so a test (or a page) can be gone before the
    // answer arrives. Remembering it then set state after `window` was torn down and failed CI.
    let answer: (page: { rows: UserRow[]; nextCursor: null }) => void = () => {};
    let asked = Promise.resolve<unknown>(null);
    const data = {
      searchUsers: vi.fn().mockResolvedValue([]),
      usersPage: vi.fn(() => (asked = new Promise((resolve) => (answer = resolve)))),
      userCount: vi.fn().mockResolvedValue(1),
    };
    // Answers the newest lookup and returns once the answer has passed every await on its way.
    const deliver = () =>
      updatesDuring(async () => {
        answer({ rows: [asha], nextCursor: null });
        await asked;
        for (let hop = 0; hop < HOPS; hop += 1) await Promise.resolve();
      });
    const { unmount } = render(
      <PeopleField data={data as never} label="People" emails={[]} onEmails={() => {}} />,
    );
    const box = screen.getByRole('combobox', { name: 'People' });
    // The control: while the field is there, its answer is an update the count sees.
    fireEvent.focus(box);
    expect(await act(deliver)).toBeGreaterThan(0);
    expect(screen.getByRole('option', { name: /Asha Rao/ })).toBeTruthy();
    fireEvent.blur(box);
    fireEvent.focus(box);
    expect(data.usersPage).toHaveBeenCalledTimes(2);
    unmount();
    // The same answer once the field has gone is no update at all.
    expect(await deliver()).toBe(0);
  });
});
