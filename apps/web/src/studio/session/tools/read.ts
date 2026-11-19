import type { Working } from '../../types';
import { courseChanges } from '@gurukul/schema/changes';
import type { ChangeRow, ListEntryChange } from '@gurukul/schema/changes';

import { z } from 'zod';
import { locate, needItem } from './find';
import type { Located } from './find';
import { answer, defineTool, refuse } from './types';

const itemId = z.string().min(1).max(80).describe('The id of a lesson or Quiz, from get_course.');

/** A lesson as it is, or a Quiz with each question's correct option ids beside it. */
function itemView(work: Working, { chapter, index, item }: Located) {
  const at = { chapterId: chapter.id, position: index + 1 };
  if (item.type === 'lesson') return { ...item, ...at };
  return {
    ...item,
    ...at,
    questions: item.questions.map((q) => ({
      ...q,
      correct: work.answers[item.id]?.[q.id] ?? [],
    })),
  };
}

export const getCourse = defineTool({
  name: 'get_course',
  description:
    'The course details, landing page and outline (chapters, lessons and Quizzes with their ids, and each lesson’s block ids and types, without block text), plus the session’s title, goals, summary and to-dos. Call it first, and again whenever you need an id.',
  input: z.strictObject({}),
  run: (state) => {
    const c = state.work.course;
    return answer(state, {
      details: {
        id: c.id,
        title: c.title,
        summary: c.summary,
        level: c.level,
        cover: { theme: c.cover.theme, glyph: c.cover.glyph, image: c.cover.image !== undefined },
        passMarkPercent: Math.round(c.rules.passMark * 100),
        sequential: c.rules.sequential,
        certificate: c.rules.certificate,
        requireVideoWatch: c.rules.requireVideoWatch,
        certificateTitle: c.certificate.title,
      },
      landing: { description: c.description, outcomes: c.outcomes },
      chapters: c.chapters.map((p) => ({
        id: p.id,
        title: p.title,
        items: p.items.map((i) =>
          i.type === 'lesson'
            ? {
                type: 'lesson',
                id: i.id,
                title: i.title,
                minutes: i.minutes,
                blocks: i.blocks.map((b) => ({ id: b.id, type: b.type })),
              }
            : { type: 'quiz', id: i.id, title: i.title, questions: i.questions.length },
        ),
      })),
      session: {
        kind: state.base === null ? 'new course' : 'edit',
        title: state.title,
        goals: state.goals,
        summary: state.summary,
        todos: state.todos.map((t) => ({
          id: t.id,
          text: t.text,
          done: t.done,
          ...(t.itemId !== undefined && { itemId: t.itemId }),
          ...(t.blockId !== undefined && { blockId: t.blockId }),
        })),
      },
    });
  },
});

export const getItem = defineTool({
  name: 'get_item',
  description:
    'One lesson with all its blocks, or one Quiz with its settings, questions and correct option ids, as it is now in this session.',
  input: z.strictObject({ itemId }),
  run: (state, { itemId }) => {
    const found = needItem(state.work.course, itemId);
    return typeof found === 'string' ? refuse(found) : answer(state, itemView(state.work, found));
  },
});

export const getBaseItem = defineTool({
  name: 'get_base_item',
  description:
    'One lesson or Quiz as it was in the draft when this session started, to compare with get_item or to put something back.',
  input: z.strictObject({ itemId }),
  run: (state, { itemId }) => {
    if (state.base === null)
      return refuse('This is a new course: nothing existed before this session.');
    const found = locate(state.base.course, itemId);
    if (!found)
      return refuse(`"${itemId}" did not exist when this session started; it was added since.`);
    return answer(state, itemView(state.base, found));
  },
});

/** Text fields of a block or question that a search looks in. */
const TEXT_FIELDS = [
  'title',
  'md',
  'code',
  'file',
  'caption',
  'alt',
  'label',
  'prompt',
  'explanation',
] as const;
const MAX_HITS = 30;
const AROUND = 40;

interface Hit {
  chapterId?: string;
  itemId?: string;
  blockId?: string;
  questionId?: string;
  field: string;
  excerpt: string;
}

export const searchCourse = defineTool({
  name: 'search_course',
  description:
    'Finds text anywhere in the course (details, landing page, chapter and item titles, blocks, questions and answers), ignoring case. Returns where each match is, with a short excerpt.',
  input: z.strictObject({
    query: z.string().trim().min(2).max(200).describe('The words to find, at least 2 characters.'),
  }),
  run: (state, { query }) => {
    const needle = query.toLowerCase();
    const hits: Hit[] = [];
    let total = 0;
    const look = (text: string, field: string, at: Omit<Hit, 'field' | 'excerpt'>) => {
      const found = text.toLowerCase().indexOf(needle);
      if (found < 0) return;
      total += 1;
      if (hits.length >= MAX_HITS) return;
      const start = Math.max(0, found - AROUND);
      const end = Math.min(text.length, found + needle.length + AROUND);
      const excerpt = `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
      hits.push({ ...at, field, excerpt });
    };
    const lookIn = (o: object, at: Omit<Hit, 'field' | 'excerpt'>) => {
      const r = o as Record<string, unknown>;
      for (const f of TEXT_FIELDS) if (typeof r[f] === 'string') look(r[f], f, at);
    };
    const c = state.work.course;
    for (const f of ['title', 'summary', 'description'] as const) look(c[f], f, {});
    c.outcomes.forEach((o, i) => look(o, `outcomes.${i}`, {}));
    look(c.certificate.title, 'certificateTitle', {});
    for (const p of c.chapters) {
      look(p.title, 'title', { chapterId: p.id });
      for (const item of p.items) {
        look(item.title, 'title', { itemId: item.id });
        if (item.type === 'lesson')
          for (const b of item.blocks) {
            const at = { itemId: item.id, blockId: b.id };
            lookIn(b, at);
            if (b.type === 'check') b.options.forEach((o, i) => look(o, `options.${i}`, at));
          }
        else
          for (const q of item.questions) {
            const at = { itemId: item.id, questionId: q.id };
            lookIn(q, at);
            q.options.forEach((o, i) => look(o.text, `options.${i}`, at));
          }
      }
    }
    return answer(state, { matches: total, shown: hits.length, hits });
  },
});

const changedEntries = (entries: readonly ListEntryChange[]) =>
  entries.filter((e) => e.statuses.length > 0).map((e) => ({ id: e.id, statuses: e.statuses }));

/** A row's title: as it is now, or as it was for something removed (a row always has one side). */
const titleOf = (after: { title: string } | null, before: { title: string } | null): string =>
  (after ?? (before as { title: string })).title;

function rowView(row: ChangeRow) {
  const base = { key: row.key, statuses: row.statuses, fields: row.fields.map((f) => f.field) };
  switch (row.kind) {
    case 'course':
      return base;
    case 'landing':
      return { ...base, outcomes: changedEntries(row.outcomes) };
    case 'chapter':
      return {
        ...base,
        title: titleOf(row.after, row.before),
        ...(row.move && { move: row.move }),
      };
    case 'lesson':
      return {
        ...base,
        chapterId: row.chapterId,
        title: titleOf(row.after, row.before),
        blocks: row.blocks
          .filter((b) => b.statuses.length > 0)
          .map((b) => ({ id: b.id, type: b.type, statuses: b.statuses })),
        ...(row.move && { move: row.move }),
      };
    case 'quiz':
      return {
        ...base,
        chapterId: row.chapterId,
        title: titleOf(row.after, row.before),
        questions: changedEntries(row.questions),
        ...(row.move && { move: row.move }),
      };
  }
}

export const listChanges = defineTool({
  name: 'list_changes',
  description:
    'What this session has changed so far compared with the draft it started from: one row per course detail, landing page, chapter, lesson or Quiz, as the Educator will see it in Review, plus every changed correct answer.',
  input: z.strictObject({}),
  run: (state) => {
    const changes = courseChanges(state.base, state.work);
    return answer(state, {
      count: changes.count,
      rows: changes.rows.map(rowView),
      answerChanges: changes.answerChanges,
    });
  },
});

/** How much of a source file one `read_source` call returns. */
export const SOURCE_CHUNK = 50_000;

const NO_SOURCES =
  'No Sources folder is set for this session. Ask the Educator to choose one if you need their material.';

export const listSources = defineTool({
  name: 'list_sources',
  description:
    'The files the Educator put in this session’s Sources folder (names and sizes). Read one with read_source.',
  input: z.strictObject({}),
  run: async (state, _input, ctx) => {
    if (!ctx.sources) return refuse(NO_SOURCES);
    const files = await ctx.sources.list();
    return answer(state, { files });
  },
});

export const readSource = defineTool({
  name: 'read_source',
  description: `The text of one file in the Sources folder, ${SOURCE_CHUNK.toLocaleString('en-GB')} characters at a time. When more is left, the answer says the offset to ask for next.`,
  input: z.strictObject({
    name: z.string().min(1).max(260).describe('The file name, exactly as list_sources gives it.'),
    offset: z.int().min(0).optional().describe('Where to start, in characters; 0 when left out.'),
  }),
  run: async (state, { name, offset = 0 }, ctx) => {
    if (!ctx.sources) return refuse(NO_SOURCES);
    const missing = `There is no file called "${name}" in the Sources folder. Call list_sources.`;
    // Only a plain name the folder lists is read: a path could reach outside the folder.
    if (/[/\\]/.test(name) || name === '.' || name === '..')
      return refuse('Give a file name exactly as list_sources gives it, without a path.');
    const listed = await ctx.sources.list();
    if (!listed.some((f) => f.name === name)) return refuse(missing);
    const text = await ctx.sources.read(name);
    if (text === null) return refuse(missing);
    const end = Math.min(text.length, offset + SOURCE_CHUNK);
    return answer(state, {
      name,
      from: offset,
      to: end,
      length: text.length,
      ...(end < text.length && { next: end }),
      text: text.slice(offset, end),
    });
  },
});

export const READ_TOOLS = [
  getCourse,
  getItem,
  getBaseItem,
  searchCourse,
  listChanges,
  listSources,
  readSource,
];
