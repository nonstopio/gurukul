import type { Block, BlockType, Course, Lesson } from '@gurukul/schema';
import { moveItem } from '@gurukul/ui';
import { newId } from './ids';

export const BLOCK_LABELS: Record<BlockType, string> = {
  markdown: 'Text',
  video: 'Video',
  code: 'Code',
  callout: 'Callout',
  image: 'Image',
  embed: 'Embed',
  file: 'File',
  check: 'Check',
};

/** The block types an Acharya can add, in palette order, with the name shown on the tile. */
export const PALETTE: ReadonlyArray<{ type: BlockType; label: string }> = (
  ['markdown', 'video', 'code', 'callout', 'image', 'embed', 'file', 'check'] as const
).map((type) => ({ type, label: BLOCK_LABELS[type] }));

export const MIN_CHECK_OPTIONS = 2;
export const MAX_CHECK_OPTIONS = 6;

/**
 * A new block with sensible defaults and a new id. Every default is valid for the course schema,
 * so a draft with a fresh block still loads; fields an Acharya must fill in (alt text, a real
 * address) are caught by the publish checks and shown inline.
 */
export function newBlock(type: BlockType, random: () => number = Math.random): Block {
  const id = newId('b', random);
  switch (type) {
    case 'markdown':
      return { type, id, md: '' };
    case 'video':
      return { type, id, provider: 'youtube', url: 'https://www.youtube.com/', captions: false };
    case 'code':
      return { type, id, lang: 'javascript', code: '', copy: true, terminal: false };
    case 'callout':
      return { type, id, tone: 'note', md: '' };
    case 'image':
      return { type, id, url: 'https://example.com/image.png', alt: '' };
    case 'embed':
      return { type, id, url: 'https://codesandbox.io/', title: '' };
    case 'file':
      return { type, id, url: 'https://example.com/file.pdf', label: '' };
    case 'check':
      return { type, id, prompt: '', options: ['', ''], explanation: '' };
  }
}

/** Still exactly what "Add a block" made? Deleting such a block needs no confirmation. */
export function isPristine(block: Block): boolean {
  const fresh = newBlock(block.type);
  return JSON.stringify({ ...block, id: '' }) === JSON.stringify({ ...fresh, id: '' });
}

export function lessonsOf(course: Course): Lesson[] {
  return course.parvas.flatMap((p) => p.items.flatMap((i) => (i.type === 'lesson' ? [i] : [])));
}

export const findLesson = (course: Course, lessonId: string): Lesson | null =>
  lessonsOf(course).find((l) => l.id === lessonId) ?? null;

/** The course with one lesson replaced by `edit(lesson)`. Nothing else changes; unknown ids change nothing. */
export function editLesson(
  course: Course,
  lessonId: string,
  edit: (lesson: Lesson) => Lesson,
): Course {
  return {
    ...course,
    parvas: course.parvas.map((p) => ({
      ...p,
      items: p.items.map((i) => (i.type === 'lesson' && i.id === lessonId ? edit(i) : i)),
    })),
  };
}

export const addBlock = (lesson: Lesson, block: Block): Lesson => ({
  ...lesson,
  blocks: [...lesson.blocks, block],
});

export const replaceBlock = (lesson: Lesson, block: Block): Lesson => ({
  ...lesson,
  blocks: lesson.blocks.map((b) => (b.id === block.id ? block : b)),
});

export const removeBlock = (lesson: Lesson, blockId: string): Lesson => ({
  ...lesson,
  blocks: lesson.blocks.filter((b) => b.id !== blockId),
});

export const moveBlock = (lesson: Lesson, from: number, to: number): Lesson => ({
  ...lesson,
  blocks: moveItem(lesson.blocks, from, to),
});

/** Inserts a copy of the block right after it, under `copyId` (ids are never shared). */
export function duplicateBlock(
  lesson: Lesson,
  blockId: string,
  copyId: string = newId('b'),
): Lesson {
  const at = lesson.blocks.findIndex((b) => b.id === blockId);
  const original = lesson.blocks[at];
  if (!original) return lesson;
  const copy: Block = { ...original, id: copyId };
  if (copy.type === 'check') copy.options = [...copy.options];
  const blocks = [...lesson.blocks];
  blocks.splice(at + 1, 0, copy);
  return { ...lesson, blocks };
}

type Check = Extract<Block, { type: 'check' }>;

/** One more empty answer, up to six. */
export const addCheckOption = (block: Check): Check =>
  block.options.length >= MAX_CHECK_OPTIONS ? block : { ...block, options: [...block.options, ''] };

/** Without answer `index`, never below two. The marked answer follows its option; removing it unmarks. */
export function removeCheckOption(block: Check, index: number): Check {
  if (block.options.length <= MIN_CHECK_OPTIONS) return block;
  const { correct, ...rest } = block;
  const next: Check = { ...rest, options: block.options.filter((_, i) => i !== index) };
  if (correct === undefined || correct === index) return next;
  return { ...next, correct: correct > index ? correct - 1 : correct };
}

/** Marks answer `index` as the right one. */
export const setCheckCorrect = (block: Check, index: number): Check => ({
  ...block,
  correct: index,
});

export const setCheckOption = (block: Check, index: number, text: string): Check => ({
  ...block,
  options: block.options.map((o, i) => (i === index ? text : o)),
});

/** Estimated minutes from what an Acharya typed: a whole number from 0 to 600. */
export function parseMinutes(raw: string): number {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 600) : 0;
}
