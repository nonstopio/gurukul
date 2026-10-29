import { z } from 'zod';
import { timestamp } from './timestamp';

/** Ids are stable forever (progress points at them): lower-case slugs, letters, digits, hyphens. */
export const slug = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'use lower-case letters, digits and hyphens');

const id = z.string().min(1).max(80);
const text = (max: number) => z.string().max(max);

export const blockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('video'),
    id,
    provider: z.enum(['youtube', 'drive', 'loom']),
    url: z.url(),
    captions: z.boolean(),
    title: text(200).optional(),
    caption: text(300).optional(),
    durationSec: z.number().int().positive().optional(),
  }),
  z.object({ type: z.literal('markdown'), id, md: text(20_000) }),
  z.object({
    type: z.literal('code'),
    id,
    lang: z.string().min(1).max(40),
    file: z.string().max(200).optional(),
    code: text(10_000),
    copy: z.boolean(),
    terminal: z.boolean(),
    highlight: z.string().max(80).optional(),
  }),
  z.object({
    type: z.literal('callout'),
    id,
    tone: z.enum(['note', 'tip', 'warning']),
    title: text(120).optional(),
    md: text(4_000),
  }),
  z.object({
    type: z.literal('image'),
    id,
    url: z.url(),
    alt: text(300),
    caption: text(300).optional(),
  }),
  z.object({ type: z.literal('embed'), id, url: z.url(), title: text(200) }),
  z.object({ type: z.literal('file'), id, url: z.url(), label: text(200) }),
  z.object({
    type: z.literal('check'),
    id,
    prompt: text(1_000),
    options: z.array(text(300)).min(2).max(6),
    /** Index into `options` of the right answer (v3). Absent on a check written before v3. */
    correct: z.number().int().min(0).max(5).optional(),
    explanation: text(2_000),
  }),
]);
export type Block = z.infer<typeof blockSchema>;
export type BlockType = Block['type'];

export const lessonSchema = z.object({
  type: z.literal('lesson'),
  id,
  title: z.string().min(1).max(160),
  minutes: z.number().int().min(0).max(600),
  layout: z.enum(['stacked', 'split', 'article']),
  completeWhen: z.enum(['manual', 'video90', 'scrolled']),
  kindLabel: text(40).optional(),
  blocks: z.array(blockSchema).max(60),
});
export type Lesson = z.infer<typeof lessonSchema>;

export const questionSchema = z.object({
  id,
  kind: z.enum(['single', 'multiple', 'trueFalse', 'codeOutput']),
  prompt: z.string().min(1).max(2_000),
  code: text(4_000).optional(),
  options: z
    .array(z.object({ id, text: z.string().min(1).max(400) }))
    .min(2)
    .max(8),
  explanation: text(2_000),
  reviewItemId: id.optional(),
});
export type Question = z.infer<typeof questionSchema>;

export const quizSchema = z
  .object({
    type: z.literal('quiz'),
    id,
    title: z.string().min(1).max(160),
    passMark: z.number().min(0).max(1).optional(),
    questionsShown: z.number().int().min(1),
    shuffleOptions: z.boolean(),
    cooldownMinutes: z.number().int().min(0).max(10_080),
    revealAnswers: z.enum(['each', 'onPass', 'never']),
    blocksNext: z.boolean(),
    questions: z.array(questionSchema).min(1).max(60),
  })
  .refine((p) => p.questionsShown <= p.questions.length, {
    message: 'questionsShown cannot exceed the number of questions',
    path: ['questionsShown'],
  });
export type Quiz = z.infer<typeof quizSchema>;

export const itemSchema = z.union([lessonSchema, quizSchema]);
export type Item = Lesson | Quiz;

export const chapterSchema = z.object({
  id,
  title: z.string().min(1).max(160),
  items: z.array(itemSchema).max(60),
});
export type Chapter = z.infer<typeof chapterSchema>;

export const COURSE_SCHEMA_VERSION = 3;

export const courseSchema = z.object({
  schemaVersion: z.literal(COURSE_SCHEMA_VERSION),
  id: slug,
  title: z.string().min(1).max(160),
  summary: z.string().max(240),
  description: text(10_000),
  level: z.enum(['foundation', 'intermediate', 'advanced']),
  cover: z.object({
    theme: z.enum(['forest', 'sand', 'sky', 'stone']),
    glyph: z.string().max(8),
  }),
  outcomes: z.array(text(200)).max(12),
  educatorIds: z.array(z.string()).max(50),
  /** Display names keyed by uid, so Studio can name a course's Educators without reading private `users`. */
  educatorNames: z
    .record(z.string(), z.string().max(120))
    .refine((names) => Object.keys(names).length <= 50, { message: 'at most 50 names' }),
  status: z.enum(['draft', 'published', 'archived']),
  version: z.number().int().min(0),
  publishedAt: timestamp.nullable(),
  rules: z.object({
    sequential: z.boolean(),
    passMark: z.number().min(0).max(1),
    certificate: z.boolean(),
    requireVideoWatch: z.boolean(),
  }),
  certificate: z.object({
    title: z.string().max(160),
  }),
  chapters: z.array(chapterSchema).max(30),
  estimatedMinutes: z.number().int().min(0),
});
export type Course = z.infer<typeof courseSchema>;
