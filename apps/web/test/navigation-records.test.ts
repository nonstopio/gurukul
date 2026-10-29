import { describe, expect, it, vi } from 'vitest';
import { log } from '../src/log';
import { courseDestinations, courseSource, loadRecords } from '../src/navigation/records';
import type { Destination, RecordSource } from '../src/navigation/types';
import { lesson, makeCourse } from './fake-data';

const dest = (id: string): Destination => ({
  id,
  path: `/${id}`,
  label: id,
  areaName: 'A',
  description: '',
  keywords: [],
  kind: 'Thing',
});

describe('courseDestinations', () => {
  it('lists each course, then its lessons with their parva, and leaves Parikshas out', () => {
    const out = courseDestinations([makeCourse()]);
    expect(out.map((d) => d.id)).toEqual([
      'course:git',
      'lesson:git/l1',
      'lesson:git/l2',
      'lesson:git/l3',
      'lesson:git/l4',
    ]);
    expect(out[0]).toEqual({
      id: 'course:git',
      path: '/courses/git',
      label: 'Git, the NonStop Way',
      areaName: 'Catalogue',
      description: 'Version control for teams.',
      keywords: ['Foundation', 'course'],
      kind: 'Course',
    });
    expect(out[3]).toEqual({
      id: 'lesson:git/l3',
      path: '/courses/git/learn/l3',
      label: 'Lesson l3',
      areaName: 'Git, the NonStop Way',
      description: 'History',
      keywords: ['lesson'],
      kind: 'Lesson',
    });
  });

  it('marks a retired course and searches a lesson by its kind label', () => {
    const course = makeCourse({
      id: 'old',
      status: 'archived',
      level: 'advanced',
      parvas: [{ id: 'p', title: 'Only', items: [lesson('lab', { kindLabel: 'Lab' })] }],
    });
    const [c, l] = courseDestinations([course]);
    expect(c).toMatchObject({
      description: 'Version control for teams. · Retired',
      keywords: ['Advanced', 'course'],
    });
    expect(l?.keywords).toEqual(['Lab', 'lesson']);
  });
});

describe('courseSource', () => {
  it('reads the catalogue query and is open to everyone', async () => {
    const listCourses = vi.fn().mockResolvedValue([makeCourse()]);
    const source = courseSource({ listCourses });
    expect(source.roles).toBeUndefined();
    expect((await source.load()).length).toBe(5);
    expect(listCourses).toHaveBeenCalledTimes(1);
  });
});

describe('loadRecords', () => {
  it('loads only the sources these roles may use', async () => {
    const people: RecordSource = { id: 'people', roles: ['kulapati'], load: vi.fn() };
    const all: RecordSource = { id: 'all', load: async () => [dest('a')] };
    expect(await loadRecords([people, all], ['shishya'])).toEqual([dest('a')]);
    expect(people.load).not.toHaveBeenCalled();
  });

  it('leaves out and logs a source that fails, keeping the others', async () => {
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
    const failed = Object.assign(new Error('nope'), { code: 'unavailable' });
    const broken: RecordSource = { id: 'broken', load: () => Promise.reject(failed) };
    const fine: RecordSource = { id: 'fine', load: async () => [dest('b')] };
    expect(await loadRecords([broken, fine], ['shishya'])).toEqual([dest('b')]);
    expect(warn).toHaveBeenCalledWith('Search records not loaded', {
      source: 'broken',
      code: 'unavailable',
    });
    warn.mockRestore();
  });
});
