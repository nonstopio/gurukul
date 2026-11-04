import { fireEvent, render, screen } from '@testing-library/react';
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
 * answer arrived after the test environment had removed `window`.
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

describe('PeopleField', () => {
  it('drops a lookup that answers after the field has gone', async () => {
    // Typing waits for a pause before it searches, so a test (or a page) can be gone before the
    // answer arrives. Remembering it then set state after `window` was torn down and failed CI.
    let answer: (page: { rows: UserRow[]; nextCursor: null }) => void = () => {};
    const data = {
      searchUsers: vi.fn().mockResolvedValue([]),
      usersPage: vi.fn(() => new Promise((resolve) => (answer = resolve))),
      userCount: vi.fn().mockResolvedValue(1),
    };
    const { unmount } = render(
      <PeopleField data={data as never} label="People" emails={[]} onEmails={() => {}} />,
    );
    fireEvent.focus(screen.getByRole('combobox', { name: 'People' }));
    expect(data.usersPage).toHaveBeenCalled();
    unmount();
    const updates = await updatesDuring(async () => {
      answer({ rows: [asha], nextCursor: null });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(updates).toBe(0);
  });

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
});
