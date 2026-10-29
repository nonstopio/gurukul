import { describe, expect, it } from 'vitest';
import { MIGRATIONS, migrateCourse, readCourse, upgradeCourse } from '../src';
import type { Lesson } from '../src';
import { makeCourse } from './fixtures';

const withBlocks = (blocks: unknown[]) => {
  const course = makeCourse();
  const [parva] = course.parvas;
  const [lesson] = parva?.items ?? [];
  if (lesson?.type === 'lesson') lesson.blocks = blocks as Lesson['blocks'];
  return course;
};
const blocksOf = (course: { parvas: { items: unknown[] }[] } | null) =>
  (course?.parvas[0]?.items[0] as Lesson | undefined)?.blocks;

describe('upgradeCourse', () => {
  const steps = {
    1: (c: Record<string, unknown>) => ({ ...c, title: `${String(c.title)} v2` }),
    2: (c: Record<string, unknown>) => ({ ...c, title: `${String(c.title)} v3` }),
  };

  it('v1 to v2 adds empty acharyaNames and keeps names a role grant already wrote', () => {
    const v1: Record<string, unknown> = { ...makeCourse(), schemaVersion: 1 };
    delete v1.acharyaNames;
    expect(upgradeCourse(v1)).toMatchObject({ schemaVersion: 3, acharyaNames: {} });
    expect(migrateCourse(v1).acharyaNames).toEqual({});
    expect(upgradeCourse({ ...v1, acharyaNames: { u1: 'Asha' } })).toMatchObject({
      acharyaNames: { u1: 'Asha' },
    });
    expect(Object.keys(MIGRATIONS)).toEqual(['1', '2']);
  });

  it('v2 to v3 leaves the course as it was: older checks have no marked answer yet', () => {
    const check = { type: 'check', id: 'k', prompt: 'p', options: ['a', 'b'], explanation: 'e' };
    const v2 = { ...withBlocks([check]), schemaVersion: 2 };
    expect(upgradeCourse(v2)).toEqual({ ...v2, schemaVersion: 3 });
    expect(blocksOf(readCourse(v2))).toEqual([check]);
  });

  it('runs every step from the stored version to the target, without changing the input', () => {
    const raw = { ...makeCourse(), schemaVersion: 1 };
    expect(upgradeCourse(raw, steps, 3)).toMatchObject({ title: 'Git v2 v3', schemaVersion: 3 });
    expect(upgradeCourse({ ...raw, schemaVersion: 2 }, steps, 3)).toMatchObject({
      title: 'Git v3',
    });
    expect(raw.title).toBe('Git');
  });

  it('leaves a current, newer or versionless course untouched', () => {
    const raw = makeCourse();
    expect(upgradeCourse(raw)).toBe(raw);
    expect(upgradeCourse(raw, steps, 3)).toBe(raw);
    expect(upgradeCourse(null, steps, 3)).toBeNull();
  });

  it('refuses a version with no step to its successor', () => {
    expect(() => upgradeCourse({ ...makeCourse(), schemaVersion: 1 }, {}, 2)).toThrow(
      /No course migration from schemaVersion 1/,
    );
  });
});

describe('migrateCourse', () => {
  it('returns a valid current course', () => {
    expect(migrateCourse(makeCourse()).id).toBe('git');
  });

  it.each([
    null,
    {},
    { schemaVersion: 0 },
    { schemaVersion: 4 },
    { schemaVersion: '1' },
    { schemaVersion: 1.5 },
  ])('refuses %j', (raw) => {
    expect(() => migrateCourse(raw)).toThrow(/Unsupported course schemaVersion/);
  });

  it('throws on a document that does not fit the shape', () => {
    expect(() => migrateCourse({ schemaVersion: 1 })).toThrow();
  });

  it('throws on a block it does not know', () => {
    expect(() => migrateCourse(withBlocks([{ type: 'poll', id: 'b9' }]))).toThrow();
  });
});

describe('readCourse', () => {
  it('reads a valid course as it is', () => {
    const course = makeCourse();
    expect(readCourse(course)).toEqual(migrateCourse(course));
  });

  it('turns an unknown or malformed block into an unsupported notice, in place', () => {
    const course = withBlocks([
      { type: 'markdown', id: 'b1', md: 'hi' },
      { type: 'poll', id: 'b2', choices: [] },
      { type: 'video', id: 'b3', url: 'not a url' },
      { type: 'hologram' },
      null,
    ]);
    expect(blocksOf(readCourse(course))).toEqual([
      { type: 'markdown', id: 'b1', md: 'hi' },
      { type: 'unsupported', id: 'b2' },
      { type: 'unsupported', id: 'b3' },
      { type: 'unsupported', id: 'unsupported' },
      { type: 'unsupported', id: 'unsupported' },
    ]);
  });

  it('reads a course from a newer app as far as this one understands it', () => {
    const newer = { ...withBlocks([{ type: 'poll', id: 'b2' }]), schemaVersion: 4, mascot: 'owl' };
    const read = readCourse(newer);
    expect(read?.schemaVersion).toBe(3);
    expect(read).not.toHaveProperty('mascot');
    expect(blocksOf(read)).toEqual([{ type: 'unsupported', id: 'b2' }]);
  });

  it.each([
    ['no version', { ...makeCourse(), schemaVersion: undefined }],
    ['not an object', 'git'],
    ['a broken course field', { ...makeCourse(), title: '' }],
    [
      'an unknown item type',
      { ...makeCourse(), parvas: [{ id: 'p1', title: 'P', items: [{ type: 'lab', id: 'x' }] }] },
    ],
  ])('gives null for a course it cannot read at all: %s', (_, raw) => {
    expect(readCourse(raw)).toBeNull();
  });
});
