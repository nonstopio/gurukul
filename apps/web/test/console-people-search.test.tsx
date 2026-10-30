import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UserRow } from '../src/console/types';
import { usePeopleLookup, usePeopleSearch } from '../src/console/usePeopleSearch';

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

describe('usePeopleLookup', () => {
  it('answers a person per match with their role, after a pause, and nothing for a short text', async () => {
    const admin = { ...person('asha'), roles: ['learner', 'admin'], displayName: 'Asha' };
    const educator = { ...person('ravi'), roles: ['learner', 'educator'], displayName: '' };
    const searchUsers = vi.fn().mockResolvedValue([admin, educator, person('sam')]);
    const { result } = renderHook(() => usePeopleLookup({ searchUsers }));
    expect(await result.current('a')).toEqual([]);
    expect(searchUsers).not.toHaveBeenCalled();
    expect(await result.current(' As ')).toEqual([
      { email: 'asha@nonstopio.com', name: 'Asha', role: 'Admin', tone: 'admin' },
      { email: 'ravi@nonstopio.com', name: undefined, role: 'Educator', tone: 'educator' },
      { email: 'sam@nonstopio.com', name: 'sam', role: 'Learner', tone: 'learner' },
    ]);
    expect(searchUsers).toHaveBeenCalledWith('as');
  });

  it('reads once for a name typed quickly: an older call gives way to the newer', async () => {
    const searchUsers = vi.fn().mockResolvedValue([person('ravi')]);
    const { result } = renderHook(() => usePeopleLookup({ searchUsers }));
    const [older, newer] = await Promise.all([result.current('ra'), result.current('rav')]);
    expect(older).toEqual([]);
    expect(newer).toHaveLength(1);
    expect(searchUsers).toHaveBeenCalledTimes(1);
  });
});
