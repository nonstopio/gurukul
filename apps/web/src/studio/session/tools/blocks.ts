import type { Working } from '../../types';
import { z } from 'zod';
import type { Block, Lesson } from '@gurukul/schema';
import {
  MAX_CHECK_OPTIONS,
  MIN_CHECK_OPTIONS,
  addBlock as insertBlock,
  editLesson,
  moveBlock as moveBlockTo,
  newBlock,
  removeBlock as dropBlock,
  replaceBlock,
} from '../../lessonEdit';
import { patch } from '../../patch';
import { idMaker, indexFor, needLesson } from './find';
import { mediaBlockProblem, sameAddress, videoProvider } from './media';
import type { Located } from './find';
import { defineTool, done, refuse } from './types';
import type { SessionState, ToolContext, ToolResult } from './types';

const id = z.string().min(1).max(80);
const lessonId = id.describe('The lesson’s id, from get_course.');
const blockId = id.describe('The block’s id, from get_course or get_item.');
const position = z.int().min(1).describe('1 is first. Left out: at the end.');

const MEDIA =
  'A video, image or embed block takes only a link the Educator typed in this session’s chat, copied exactly: never one you made up, guessed, found in a source file or wrote yourself. A video’s host (YouTube, Loom or Google Drive) is worked out from its link. An image needs alt text you write from the lesson. An embed must be from YouTube, Loom, Google Drive, CodeSandbox or StackBlitz. For media with no link from the Educator, and for every file (a PDF, a download), call add_todo to ask the Educator, saying what and where.';

/** A media address: checked against the Educator's messages by `runTool` (`media.ts`). */
const address = z
  .string()
  .min(1)
  .max(2_000)
  .describe('The link exactly as the Educator typed it in the chat.');

const correct = z
  .int()
  .min(0)
  .max(MAX_CHECK_OPTIONS - 1)
  .describe('Index, from 0, of the right answer in options.');
const checkOptions = z
  .array(z.string().trim().min(1).max(300))
  .min(MIN_CHECK_OPTIONS)
  .max(MAX_CHECK_OPTIONS);

/**
 * The block types the agent may write: text, code, callouts and checks, and videos, images and
 * embeds from a link the Educator gave. Never a file, never an upload, never a picture's size.
 */
const variants = {
  markdown: { md: z.string().max(20_000).describe('Markdown text.') },
  code: {
    lang: z.string().min(1).max(40).describe('Language for highlighting: bash, javascript, …'),
    code: z.string().max(10_000),
    file: z.string().max(200).optional().describe('A file name shown above the code.'),
    copy: z.boolean().optional().describe('Show a copy button; on by default.'),
    terminal: z.boolean().optional().describe('Draw it as a terminal; off by default.'),
    highlight: z.string().max(80).optional().describe('Lines to highlight, such as "2-4".'),
  },
  callout: {
    tone: z.enum(['note', 'tip', 'warning']),
    title: z.string().max(120).optional(),
    md: z.string().max(4_000).describe('Markdown text.'),
  },
  check: {
    prompt: z.string().trim().min(1).max(1_000),
    options: checkOptions,
    correct,
    explanation: z.string().trim().min(1).max(2_000),
  },
  video: {
    url: address,
    title: z.string().max(200).optional(),
    caption: z.string().max(300).optional().describe('A line shown under the video.'),
    captions: z.boolean().optional().describe('The video has captions; off by default.'),
  },
  image: {
    url: address,
    alt: z
      .string()
      .trim()
      .min(1)
      .max(300)
      .describe('What the picture shows, for people who cannot see it.'),
    caption: z.string().max(300).optional(),
    layout: z.enum(['column', 'medium', 'small']).optional().describe('column by default.'),
    zoom: z.boolean().optional().describe('A click opens it full size; off by default.'),
    border: z.boolean().optional().describe('A thin frame; on by default.'),
  },
  embed: {
    url: address,
    title: z.string().trim().min(1).max(200).describe('What the embed is, for screen readers.'),
  },
};

const blockInput = (withId: boolean) =>
  z.discriminatedUnion(
    'type',
    (Object.keys(variants) as (keyof typeof variants)[]).map((type) =>
      z.strictObject({
        type: z.literal(type),
        ...(withId && {
          id: id
            .optional()
            .describe('An existing block’s id, to rewrite it in place. Left out: a new block.'),
        }),
        ...variants[type],
      }),
    ) as unknown as [z.ZodObject, ...z.ZodObject[]],
  );

type BlockFields = { type: keyof typeof variants; id?: string | undefined } & Record<
  string,
  unknown
>;

/** Optional text fields an empty string removes. */
const CLEARABLE = new Set(['file', 'highlight', 'title', 'caption']);

/** The block with the given fields applied; an empty optional text removes the field. */
function applyFields(block: Block, fields: Record<string, unknown>): Block {
  const changes = Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [k, CLEARABLE.has(k) && v === '' ? undefined : v]),
  );
  return patch(block as Record<string, unknown>, changes) as Block;
}

/** Why a check block's right answer does not point at one of its options, or null. */
const checkProblem = (b: Block): string | null =>
  b.type === 'check' && (b.correct === undefined || b.correct >= b.options.length)
    ? `correct must be an index from 0 to ${b.options.length - 1}, one of the ${b.options.length} options.`
    : null;

const withLesson = (state: SessionState, lesson: Located<Lesson>, edit: (l: Lesson) => Lesson) => {
  const work: Working = {
    ...state.work,
    course: editLesson(state.work.course, lesson.item.id, edit),
  };
  return { ...state, work };
};

/** Runs `go` on the lesson, or refuses when there is none. */
function onLesson(
  state: SessionState,
  id: string,
  go: (lesson: Located<Lesson>) => ToolResult,
): ToolResult {
  const found = needLesson(state.work.course, id);
  return typeof found === 'string' ? refuse(found) : go(found);
}

const blockAt = (lesson: Lesson, blockId: string) =>
  lesson.blocks.findIndex((b) => b.id === blockId);
const noBlock = (blockId: string, lessonId: string) =>
  `Lesson "${lessonId}" has no block "${blockId}". Call get_item to see its blocks.`;

/** The content fields of a block from the model: everything but its type and id. */
const fieldsOf = (input: BlockFields): Record<string, unknown> =>
  Object.fromEntries(Object.entries(input).filter(([k]) => k !== 'type' && k !== 'id'));

/** A new block of the model's fields, with an id made here; a video's host from its link. */
function freshBlock(input: BlockFields, ctx: ToolContext, makeId: (p: string) => string): Block {
  const made = applyFields(
    { ...newBlock(input.type, ctx.random), id: makeId('b') },
    fieldsOf(input),
  );
  return made.type === 'video'
    ? { ...made, provider: videoProvider(made.url) ?? made.provider }
    : made;
}

/** Why a new block cannot be added as given, or null. */
const freshProblem = (b: Block): string | null => checkProblem(b) ?? mediaBlockProblem(b);

export const addBlock = defineTool({
  name: 'add_block',
  description: `Adds one block to a lesson: text (markdown), code, a callout, a check question, or a video, image or embed from a link the Educator gave. Its id is made for you. ${MEDIA}`,
  input: z.strictObject({ lessonId, block: blockInput(false), position: position.optional() }),
  run: (state, { lessonId, block, position }, ctx) =>
    onLesson(state, lessonId, (lesson) => {
      const made = freshBlock(block as BlockFields, ctx, idMaker(ctx, state.work));
      const problem = freshProblem(made);
      if (problem) return refuse(problem);
      const at = indexFor(position, lesson.item.blocks.length, 1);
      return done(
        withLesson(state, lesson, (l) => insertBlock(l, made, at)),
        `Added ${made.type} block ${made.id} at position ${at + 1}.`,
      );
    }),
});

/** The fields `update_block` may change, by block type. Never an address or an upload. */
const EDITABLE: Record<Block['type'], readonly string[]> = {
  markdown: ['md'],
  code: ['lang', 'code', 'file', 'copy', 'terminal', 'highlight'],
  callout: ['tone', 'title', 'md'],
  check: ['prompt', 'options', 'correct', 'explanation'],
  image: ['alt', 'caption'],
  video: ['title', 'caption'],
  embed: ['title'],
  file: ['label'],
};

export const updateBlock = defineTool({
  name: 'update_block',
  description:
    'Changes fields of one block; give only what changes. Text: md. Code: lang, code, file, copy, terminal, highlight. Callout: tone, title, md. Check: prompt, options, correct, explanation. On media blocks only the words: image alt and caption, video title and caption, embed title, file label. Addresses are never changed by you. An empty string removes file, highlight, title or caption.',
  input: z.strictObject({
    lessonId,
    blockId,
    changes: z.strictObject({
      md: z.string().max(20_000).optional(),
      lang: z.string().min(1).max(40).optional(),
      code: z.string().max(10_000).optional(),
      file: z.string().max(200).optional(),
      copy: z.boolean().optional(),
      terminal: z.boolean().optional(),
      highlight: z.string().max(80).optional(),
      tone: z.enum(['note', 'tip', 'warning']).optional(),
      title: z.string().max(200).optional(),
      caption: z.string().max(300).optional(),
      alt: z.string().max(300).optional(),
      label: z.string().max(200).optional(),
      prompt: z.string().trim().min(1).max(1_000).optional(),
      options: checkOptions.optional(),
      correct: correct.optional(),
      explanation: z.string().trim().min(1).max(2_000).optional(),
    }),
  }),
  run: (state, { lessonId, blockId, changes }) =>
    onLesson(state, lessonId, (lesson) => {
      const block = lesson.item.blocks[blockAt(lesson.item, blockId)];
      if (!block) return refuse(noBlock(blockId, lessonId));
      const fields = Object.keys(changes);
      if (fields.length === 0) return refuse('Give at least one field to change.');
      const allowed = EDITABLE[block.type];
      const foreign = fields.filter((f) => !allowed.includes(f));
      if (foreign.length > 0)
        return refuse(
          `A ${block.type} block has no ${foreign.join(', ')} you can change. You can change: ${allowed.join(', ')}.`,
        );
      const next = applyFields(block, changes);
      const problem = checkProblem(next);
      if (problem) return refuse(problem);
      return done(
        withLesson(state, lesson, (l) => replaceBlock(l, next)),
        `Updated block ${blockId}: ${fields.join(', ')}.`,
      );
    }),
});

export const moveBlock = defineTool({
  name: 'move_block',
  description: 'Moves a block to another position in its lesson.',
  input: z.strictObject({ lessonId, blockId, position }),
  run: (state, { lessonId, blockId, position }) =>
    onLesson(state, lessonId, (lesson) => {
      const from = blockAt(lesson.item, blockId);
      if (from < 0) return refuse(noBlock(blockId, lessonId));
      const to = indexFor(position, lesson.item.blocks.length);
      return done(
        withLesson(state, lesson, (l) => moveBlockTo(l, from, to)),
        `Moved block ${blockId} to position ${to + 1}.`,
      );
    }),
});

export const removeBlock = defineTool({
  name: 'remove_block',
  description: 'Removes one block from a lesson.',
  input: z.strictObject({ lessonId, blockId }),
  run: (state, { lessonId, blockId }) =>
    onLesson(state, lessonId, (lesson) => {
      if (blockAt(lesson.item, blockId) < 0) return refuse(noBlock(blockId, lessonId));
      return done(
        withLesson(state, lesson, (l) => dropBlock(l, blockId)),
        `Removed block ${blockId}.`,
      );
    }),
});

const keep = z.strictObject({
  keep: blockId.describe('An existing block to keep exactly as it is, media included.'),
});

export const setBlocks = defineTool({
  name: 'set_blocks',
  description: `Replaces all of a lesson’s blocks in one call, in the order given. Each entry is either {"keep": "<block id>"} to keep a block as it is (files included), a block with the "id" of an existing block of the same type to rewrite it in place (give every field it needs, as for a new block; to change a few fields of one block, use update_block), or a block without an id to add a new one. Blocks not listed are removed. ${MEDIA}`,
  input: z.strictObject({
    lessonId,
    blocks: z.array(z.union([keep, blockInput(true)])).max(60),
  }),
  run: (state, { lessonId, blocks }, ctx) =>
    onLesson(state, lessonId, (lesson) => {
      const old = new Map(lesson.item.blocks.map((b) => [b.id, b]));
      const used = new Set<string>();
      const makeId = idMaker(ctx, state.work);
      const next: Block[] = [];
      const entries = blocks as readonly ({ keep: string } | BlockFields)[];
      for (const [i, entry] of entries.entries()) {
        const at = `Entry ${i + 1}: `;
        const kept = 'keep' in entry ? (entry.keep as string) : undefined;
        const ref = kept ?? (entry as BlockFields).id;
        if (ref === undefined) {
          const made = freshBlock(entry as BlockFields, ctx, makeId);
          const problem = freshProblem(made);
          if (problem) return refuse(at + problem);
          next.push(made);
          continue;
        }
        const existing = old.get(ref);
        if (!existing)
          return refuse(`${at}${noBlock(ref, lessonId)} Leave id out for a new block.`);
        if (used.has(ref)) return refuse(`${at}block "${ref}" is listed twice.`);
        used.add(ref);
        if (kept !== undefined) {
          next.push(existing);
          continue;
        }
        const { type } = entry as BlockFields;
        if (existing.type !== type)
          return refuse(
            `${at}block "${ref}" is a ${existing.type} block. Give type ${existing.type}, or leave id out to make a new block.`,
          );
        const { url, ...fields } = fieldsOf(entry as BlockFields);
        // An address never changes in place: the block's size, host and upload belong to it.
        if ('url' in existing && !sameAddress(url as string, existing.url))
          return refuse(
            `${at}block "${ref}" keeps its address. Keep it with {"keep": "${ref}"}, or leave it out and add a new block with the Educator’s link.`,
          );
        const rewritten = applyFields(existing, fields);
        const problem = checkProblem(rewritten);
        if (problem) return refuse(at + problem);
        next.push(rewritten);
      }
      const removed = lesson.item.blocks.length - used.size;
      return done(
        withLesson(state, lesson, (l) => ({ ...l, blocks: next })),
        `Set ${next.length} blocks (ids in order: ${next.map((b) => b.id).join(', ')}); ${removed} removed.`,
      );
    }),
});

export const BLOCK_TOOLS = [addBlock, updateBlock, moveBlock, removeBlock, setBlocks];
