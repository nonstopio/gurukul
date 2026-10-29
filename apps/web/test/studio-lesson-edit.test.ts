import { blockSchema, lessonSchema } from '@gurukul/schema';
import type { Block, BlockType, Lesson } from '@gurukul/schema';
import { describe, expect, it } from 'vitest';
import {
  BLOCK_LABELS,
  PALETTE,
  addBlock,
  addCheckOption,
  duplicateBlock,
  editLesson,
  findLesson,
  isPristine,
  lessonsOf,
  moveBlock,
  newBlock,
  parseMinutes,
  removeBlock,
  removeCheckOption,
  replaceBlock,
  setCheckCorrect,
  setCheckOption,
} from '../src/studio/lessonEdit';
import { lesson, makeCourse } from './fake-data';

const seq = () => {
  let n = 0;
  return () => ((n++ % 16) + 0.5) / 16;
};
const lessonOf = (blocks: Block[]): Lesson => lesson('l', { blocks }) as Lesson;
type Check = Extract<Block, { type: 'check' }>;
const check = (): Check => ({ ...(newBlock('check') as Check), options: ['a', 'b'] });

describe('new blocks', () => {
  it('offers the eight block types in palette order', () => {
    expect(PALETTE.map((p) => p.label)).toEqual([
      'Text',
      'Video',
      'Code',
      'Callout',
      'Image',
      'Embed',
      'File',
      'Check',
    ]);
    expect(BLOCK_LABELS.markdown).toBe('Text');
  });

  it.each(PALETTE.map((p) => p.type))('a new %s block is valid for the course schema', (type) => {
    const block = newBlock(type as BlockType, seq());
    expect(block.type).toBe(type);
    expect(blockSchema.safeParse(block).success).toBe(true);
    expect(block.id).toMatch(/^b-[0-9a-f]{8}$/);
  });

  it('gives every new block its own id', () => {
    expect(newBlock('markdown').id).not.toBe(newBlock('markdown').id);
  });

  it('knows an untouched block from an edited one, whatever its id', () => {
    const fresh = newBlock('image');
    expect(isPristine(fresh)).toBe(true);
    expect(isPristine({ ...fresh, id: 'other' })).toBe(true);
    expect(isPristine({ ...fresh, alt: 'A diagram' } as Block)).toBe(false);
  });
});

describe('editing a lesson', () => {
  it('finds lessons and ignores quizzes', () => {
    const course = makeCourse();
    expect(lessonsOf(course).map((l) => l.id)).toEqual(['l1', 'l2', 'l3', 'l4']);
    expect(findLesson(course, 'l2')?.id).toBe('l2');
    expect(findLesson(course, 'q1')).toBeNull();
  });

  it('replaces only the named lesson and leaves the original untouched', () => {
    const course = makeCourse();
    const next = editLesson(course, 'l2', (l) => ({ ...l, title: 'New' }));
    expect(findLesson(next, 'l2')?.title).toBe('New');
    expect(findLesson(next, 'l1')?.title).toBe('Lesson l1');
    expect(findLesson(course, 'l2')?.title).toBe('Lesson l2');
    expect(next.chapters[1]?.items[1]).toBe(course.chapters[1]?.items[1]);
    expect(editLesson(course, 'nope', (l) => ({ ...l, title: 'X' }))).toEqual(course);
  });

  it('adds, replaces, removes and moves blocks without mutating', () => {
    const a = newBlock('markdown');
    const b = newBlock('video');
    const base = lessonOf([a]);
    const added = addBlock(base, b);
    expect(added.blocks.map((x) => x.id)).toEqual([a.id, b.id]);
    expect(base.blocks).toHaveLength(1);
    const replaced = replaceBlock(added, {
      ...(a as Extract<Block, { type: 'markdown' }>),
      md: 'x',
    });
    expect((replaced.blocks[0] as { md: string }).md).toBe('x');
    expect(moveBlock(added, 0, 1).blocks.map((x) => x.id)).toEqual([b.id, a.id]);
    expect(moveBlock(added, 1, 0).blocks.map((x) => x.id)).toEqual([b.id, a.id]);
    expect(removeBlock(added, a.id).blocks.map((x) => x.id)).toEqual([b.id]);
  });

  it('duplicates a block right after the original under a new id', () => {
    const a = newBlock('markdown');
    const c = check();
    const base = lessonOf([a, c]);
    const copy = duplicateBlock(base, a.id, 'copy-1');
    expect(copy.blocks.map((x) => x.id)).toEqual([a.id, 'copy-1', c.id]);
    expect(copy.blocks[1]).toMatchObject({ type: 'markdown', md: '' });
    const auto = duplicateBlock(base, a.id);
    expect(auto.blocks[1]?.id).not.toBe(a.id);
    expect(auto.blocks[1]?.id).toMatch(/^b-[0-9a-f]{8}$/);
  });

  it('copies a check block with its own list of answers', () => {
    const c = check();
    const copy = duplicateBlock(lessonOf([c]), c.id, 'c2').blocks[1] as Check;
    expect(copy.options).toEqual(c.options);
    expect(copy.options).not.toBe(c.options);
  });

  it('leaves the lesson alone when the block to duplicate does not exist', () => {
    const base = lessonOf([newBlock('markdown')]);
    expect(duplicateBlock(base, 'missing')).toBe(base);
  });
});

describe('check answers', () => {
  it('adds up to six and removes down to two', () => {
    let c = check();
    for (let i = 0; i < 6; i++) c = addCheckOption(c);
    expect(c.options).toHaveLength(6);
    expect(addCheckOption(c)).toBe(c);
    for (let i = 0; i < 6; i++) c = removeCheckOption(c, 0);
    expect(c.options).toHaveLength(2);
    expect(removeCheckOption(c, 0)).toBe(c);
  });

  it('removes the answer at the index and edits one in place', () => {
    const c = { ...check(), options: ['a', 'b', 'c'] };
    expect(removeCheckOption(c, 1).options).toEqual(['a', 'c']);
    expect(setCheckOption(c, 2, 'z').options).toEqual(['a', 'b', 'z']);
  });

  it('marks the right answer, which follows its option when an earlier one is removed', () => {
    const c = { ...check(), options: ['a', 'b', 'c'] };
    expect(setCheckCorrect(c, 2).correct).toBe(2);
    expect(removeCheckOption(setCheckCorrect(c, 2), 0).correct).toBe(1);
    expect(removeCheckOption(setCheckCorrect(c, 0), 2).correct).toBe(0);
  });

  it('unmarks the right answer when its own option is removed', () => {
    const c = setCheckCorrect({ ...check(), options: ['a', 'b', 'c'] }, 1);
    expect(removeCheckOption(c, 1)).not.toHaveProperty('correct');
    expect(removeCheckOption({ ...check(), options: ['a', 'b', 'c'] }, 1)).not.toHaveProperty(
      'correct',
    );
  });
});

describe('estimated minutes', () => {
  it('parses what was typed into 0 to 600', () => {
    expect(parseMinutes('12')).toBe(12);
    expect(parseMinutes('7.6')).toBe(8);
    expect(parseMinutes('-3')).toBe(0);
    expect(parseMinutes('9000')).toBe(600);
    expect(parseMinutes('')).toBe(0);
    expect(parseMinutes('abc')).toBe(0);
  });

  it('keeps a lesson valid for the schema', () => {
    expect(lessonSchema.safeParse(lessonOf([newBlock('markdown')])).success).toBe(true);
  });
});
