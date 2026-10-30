import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UserRow } from '../src/console/types';
import { usePeopleLookup } from '../src/console/usePeopleSearch';

const person = (uid: string): UserRow => ({
  uid,
  email: `${uid}@nonstopio.com`,
  displayName: uid,
  team: null,
  roles: ['learner'],
  grantedCourseIds: [],
  createdAt: null,
});

describe('usePeopleLookup', () => {
  const lookup = (over: Record<string, unknown> = {}) => {
    const data = {
      searchUsers: vi.fn().mockResolvedValue([]),
      usersPage: vi.fn().mockResolvedValue({ rows: [], nextCursor: null }),
      userCount: vi.fn().mockResolvedValue(42),
      ...over,
    };
    return { data, ...renderHook(() => usePeopleLookup(data as never)) };
  };

  it('answers a person per match with their role and photo, after a pause, from one letter', async () => {
    const admin = {
      ...person('asha'),
      roles: ['learner', 'admin'],
      displayName: 'Asha',
      photoURL: 'https://img.example/asha.png',
    };
    const educator = { ...person('ravi'), roles: ['learner', 'educator'], displayName: '' };
    const { data, result } = lookup({
      searchUsers: vi.fn().mockResolvedValue([admin, educator, person('sam')]),
    });
    expect(await result.current.search(' As ')).toEqual([
      {
        email: 'asha@nonstopio.com',
        name: 'Asha',
        photoUrl: 'https://img.example/asha.png',
        role: 'Admin',
        tone: 'admin',
      },
      {
        email: 'ravi@nonstopio.com',
        name: undefined,
        photoUrl: undefined,
        role: 'Educator',
        tone: 'educator',
      },
      {
        email: 'sam@nonstopio.com',
        name: 'sam',
        photoUrl: undefined,
        role: 'Learner',
        tone: 'learner',
      },
    ]);
    expect(data.searchUsers).toHaveBeenCalledWith('as');
  });

  it('answers the first ten people at once when nothing is typed, and says how many there are', async () => {
    const { data, result } = lookup({
      usersPage: vi.fn().mockResolvedValue({ rows: [person('sam')], nextCursor: null }),
    });
    expect(await result.current.search('  ')).toHaveLength(1);
    expect(data.usersPage).toHaveBeenCalledWith(null, 10);
    expect(data.searchUsers).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.total).toBe(42));
  });

  it('keeps working when the total cannot be read', async () => {
    const { result } = lookup({ userCount: vi.fn().mockRejectedValue(new Error('x')) });
    await act(async () => {});
    expect(result.current.total).toBeUndefined();
  });

  it('reads once for a name typed quickly: an older call gives way to the newer', async () => {
    const { data, result } = lookup({ searchUsers: vi.fn().mockResolvedValue([person('ravi')]) });
    const [older, newer] = await Promise.all([
      result.current.search('ra'),
      result.current.search('rav'),
    ]);
    expect(older).toEqual([]);
    expect(newer).toHaveLength(1);
    expect(data.searchUsers).toHaveBeenCalledTimes(1);
  });
});
