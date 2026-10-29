import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UserRow } from '../src/console/types';
import { usePeopleSearch } from '../src/console/usePeopleSearch';

const person = (uid: string): UserRow => ({
  uid,
  email: `${uid}@nonstopio.com`,
  displayName: uid,
  team: null,
  roles: ['learner'],
  grantedCourseIds: [],
  createdAt: null,
});

describe('usePeopleSearch', () => {
  it('searches from two characters, lower-cased and trimmed', async () => {
    const searchUsers = vi.fn().mockResolvedValue([person('ananya')]);
    const { result } = renderHook(() => usePeopleSearch({ searchUsers }));
    await act(() => result.current.search('A'));
    expect(searchUsers).not.toHaveBeenCalled();
    await act(() => result.current.search(' AnA '));
    expect(searchUsers).toHaveBeenCalledWith('ana');
    expect(result.current.query).toBe(' AnA ');
    expect(result.current.found.map((u) => u.uid)).toEqual(['ananya']);
    await act(() => result.current.search('A'));
    expect(result.current.found).toEqual([]);
  });

  it('shows only the newest search, even when an older one answers last', async () => {
    let answerSlow: (rows: UserRow[]) => void = () => {};
    const searchUsers = vi
      .fn()
      .mockReturnValueOnce(new Promise<UserRow[]>((resolve) => (answerSlow = resolve)))
      .mockResolvedValueOnce([person('ravi')]);
    const { result } = renderHook(() => usePeopleSearch({ searchUsers }));
    let slow: Promise<void> = Promise.resolve();
    act(() => {
      slow = result.current.search('ra');
    });
    await act(() => result.current.search('rav'));
    await act(async () => {
      answerSlow([person('rahul'), person('ravi')]);
      await slow;
    });
    expect(result.current.found.map((u) => u.uid)).toEqual(['ravi']);
  });
});
