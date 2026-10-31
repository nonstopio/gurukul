import { describe, expect, it, vi } from 'vitest';
import { log } from '../src/log';
import type { UserRow } from '../src/console/types';
import { terms } from '../src/labels/terms';
import {
  courseDestinations,
  courseSource,
  editableCourseDestinations,
  editableCourseSource,
  findRecords,
  learnerPath,
  loadRecords,
  peopleLookup,
  personDestinations,
} from '../src/navigation/records';
import type { Destination, RecordLookup, RecordSource } from '../src/navigation/types';
import { lesson, makeCourse } from './fake-data';
import { draftDoc } from './fake-studio';

const GENERIC = terms('generic');

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
  it('lists each course, then its lessons with their chapter, and leaves Quizzes out', () => {
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
      chapters: [{ id: 'p', title: 'Only', items: [lesson('lab', { kindLabel: 'Lab' })] }],
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

describe('editableCourseDestinations', () => {
  const rows = [
    {
      live: makeCourse({ id: 'new', title: 'Old title', status: 'draft', educatorIds: ['u1'] }),
      draft: draftDoc(makeCourse({ id: 'new', title: 'Brand new', summary: 'Still writing.' })),
    },
    { live: makeCourse({ educatorIds: ['u1'] }), draft: null },
    { live: makeCourse({ id: 'other', title: 'Not mine', educatorIds: ['x'] }), draft: null },
  ];

  it('lists the courses this Educator edits, titled from the draft, opening the editor', () => {
    const out = editableCourseDestinations(rows, 'u1', false, GENERIC);
    expect(out).toEqual([
      {
        id: 'studio:new',
        path: '/studio/courses/new',
        label: 'Brand new',
        areaName: 'Studio',
        description: 'Draft · Still writing.',
        keywords: ['Draft', 'edit', 'course'],
        kind: 'Course',
      },
      expect.objectContaining({
        id: 'studio:git',
        label: 'Git, the NonStop Way',
        description: 'Published · Version control for teams.',
      }),
    ]);
  });

  it('gives an Admin every course, as Studio does', () => {
    expect(editableCourseDestinations(rows, 'k1', true, GENERIC).map((d) => d.id)).toEqual([
      'studio:new',
      'studio:git',
      'studio:other',
    ]);
  });
});

describe('editableCourseSource', () => {
  it("is for Educators and Admins and reads Studio's course list", async () => {
    const listCourses = vi.fn().mockResolvedValue([{ live: makeCourse(), draft: null }]);
    const source = editableCourseSource({ listCourses }, 'u1', true, GENERIC);
    expect(source.roles).toEqual(['educator', 'admin']);
    expect((await source.load()).map((d) => d.path)).toEqual(['/studio/courses/git']);
    expect(listCourses).toHaveBeenCalledWith('u1', true);
  });
});

describe('loadRecords', () => {
  it('loads only the sources these roles may use', async () => {
    const people: RecordSource = { id: 'people', roles: ['admin'], load: vi.fn() };
    const all: RecordSource = { id: 'all', load: async () => [dest('a')] };
    expect(await loadRecords([people, all], ['learner'])).toEqual([dest('a')]);
    expect(people.load).not.toHaveBeenCalled();
  });

  it('leaves out and logs a source that fails, keeping the others', async () => {
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
    const failed = Object.assign(new Error('nope'), { code: 'unavailable' });
    const broken: RecordSource = { id: 'broken', load: () => Promise.reject(failed) };
    const fine: RecordSource = { id: 'fine', load: async () => [dest('b')] };
    expect(await loadRecords([broken, fine], ['learner'])).toEqual([dest('b')]);
    expect(warn).toHaveBeenCalledWith('Search records not loaded', {
      source: 'broken',
      code: 'unavailable',
    });
    warn.mockRestore();
  });
});

const person = (over: Partial<UserRow> = {}): UserRow => ({
  uid: 'u1',
  email: 'asha.rao@example.com',
  displayName: 'Asha Rao',
  teamIds: [],
  roles: [],
  grantedCourseIds: [],
  createdAt: null,
  ...over,
});

describe('personDestinations', () => {
  it('names each person, with their email and team beneath, opening their drawer', () => {
    const [a, b] = personDestinations(
      [
        person({ teamIds: ['mobile'] }),
        person({ uid: 'u/2', displayName: '', email: 'no.name@example.com' }),
      ],
      GENERIC,
    );
    expect(a).toEqual({
      id: 'person:u1',
      path: '/admin/learners?learner=u1',
      label: 'Asha Rao',
      areaName: 'Learners',
      description: 'asha.rao@example.com',
      keywords: ['person', 'learner'],
      kind: 'Person',
    });
    expect(b).toMatchObject({
      label: 'no.name@example.com',
      description: 'no.name@example.com',
      path: learnerPath('u/2'),
    });
    expect(learnerPath('u/2')).toBe('/admin/learners?learner=u%2F2');
  });
});

describe('peopleLookup', () => {
  it('is for Admins and reads the console people search by prefix', async () => {
    const searchUsers = vi.fn().mockResolvedValue([person()]);
    const lookup = peopleLookup({ searchUsers }, GENERIC);
    expect(lookup.roles).toEqual(['admin']);
    expect((await lookup.find('as')).map((d) => d.id)).toEqual(['person:u1']);
    expect(searchUsers).toHaveBeenCalledWith('as');
  });
});

describe('findRecords', () => {
  it('asks every lookup for the prefix, leaving out and logging one that fails', async () => {
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
    const fine: RecordLookup = { id: 'fine', find: vi.fn(async () => [dest('p')]) };
    const broken: RecordLookup = { id: 'broken', find: () => Promise.reject(new Error('x')) };
    expect(await findRecords([broken, fine], 'as')).toEqual([dest('p')]);
    expect(fine.find).toHaveBeenCalledWith('as');
    expect(warn).toHaveBeenCalledWith('Search records not loaded', {
      source: 'broken',
      code: undefined,
    });
    warn.mockRestore();
  });
});
