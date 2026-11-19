import type { Working } from '../../types';
import { z } from 'zod';
import type { Lesson } from '@gurukul/schema';
import {
  addChapter as addEmptyChapter,
  addLesson as addEmptyLesson,
  addQuiz as addEmptyQuiz,
  deleteChapter,
  deleteItem,
  moveChapter as moveChapterTo,
  moveItemToChapter,
  moveItemWithin,
  renameChapter,
  renameItem,
} from '../../courseEdit';
import { editLesson } from '../../lessonEdit';
import { patch } from '../../patch';
import { addQuestion, updateQuiz } from '../../questionEdit';
import type { Keyed } from '../../questionEdit';
import { idMaker, indexFor, named, needChapter, needItem } from './find';
import { buildQuestion, questionInput, quizSettings, settingsPatch } from './quiz';
import { defineTool, done, refuse } from './types';

const id = z.string().min(1).max(80);
const chapterId = id.describe('The chapter’s id, from get_course.');
const itemId = id.describe('The id of a lesson or Quiz, from get_course.');
const title = z.string().trim().min(1).max(160);
const position = z.int().min(1).describe('1 is first. Left out: at the end.');

const lessonSettings = {
  minutes: z.int().min(0).max(600).optional().describe('Estimated minutes to finish the lesson.'),
  layout: z
    .enum(['stacked', 'split', 'article'])
    .optional()
    .describe(
      'stacked: blocks one under another; split: text beside code or media; article: reading.',
    ),
  completeWhen: z
    .enum(['manual', 'video90', 'scrolled'])
    .optional()
    .describe(
      'manual: the learner marks it done; video90: 90% of the video watched; scrolled: read to the end.',
    ),
  kindLabel: z
    .string()
    .max(40)
    .optional()
    .describe('A short label shown on the lesson, such as "Lab". An empty string removes it.'),
};
type LessonSettings = { [K in keyof typeof lessonSettings]?: z.output<(typeof lessonSettings)[K]> };

/** The lesson settings given, as a patch: an empty `kindLabel` removes it. */
function lessonPatch(s: LessonSettings): Partial<Lesson> {
  const out: Partial<Lesson> = {};
  if (s.minutes !== undefined) out.minutes = s.minutes;
  if (s.layout !== undefined) out.layout = s.layout;
  if (s.completeWhen !== undefined) out.completeWhen = s.completeWhen;
  return out;
}

const setLesson = (w: Working, lessonId: string, s: LessonSettings): Working => ({
  ...w,
  course: editLesson(w.course, lessonId, (l) =>
    patch(l, {
      ...lessonPatch(s),
      ...(s.kindLabel !== undefined && { kindLabel: s.kindLabel === '' ? undefined : s.kindLabel }),
    }),
  ),
});

/** Moves the newest item of a chapter (its last) to `position`; returns the work and the final index. */
function placeLast(w: Working, chapterId: string, position: number | undefined) {
  const length = (w.course.chapters.find((p) => p.id === chapterId) as { items: unknown[] }).items
    .length;
  const to = indexFor(position, length);
  return { work: moveItemWithin(w, chapterId, length - 1, to), to };
}

export const addChapter = defineTool({
  name: 'add_chapter',
  description: 'Adds a chapter with a title. Its id is made for you and returned.',
  input: z.strictObject({ title, position: position.optional() }),
  run: (state, { title, position }, ctx) => {
    const chapterId = idMaker(ctx, state.work)('chapter');
    let work = renameChapter(addEmptyChapter(state.work, chapterId), chapterId, title);
    const length = work.course.chapters.length;
    const to = indexFor(position, length);
    work = moveChapterTo(work, length - 1, to);
    return done({ ...state, work }, `Added chapter ${chapterId} at position ${to + 1}.`);
  },
});

export const updateChapter = defineTool({
  name: 'update_chapter',
  description: 'Renames a chapter. Its id stays the same.',
  input: z.strictObject({ chapterId, title }),
  run: (state, { chapterId, title }) => {
    const chapter = needChapter(state.work.course, chapterId);
    if (typeof chapter === 'string') return refuse(chapter);
    const work = renameChapter(state.work, chapterId, title);
    return done({ ...state, work }, `Renamed chapter ${chapterId}.`);
  },
});

export const moveChapter = defineTool({
  name: 'move_chapter',
  description: 'Moves a chapter, with everything in it, to another position in the course.',
  input: z.strictObject({ chapterId, position }),
  run: (state, { chapterId, position }) => {
    const chapters = state.work.course.chapters;
    const from = chapters.findIndex((p) => p.id === chapterId);
    if (from < 0) return refuse(needChapter(state.work.course, chapterId) as string);
    const to = indexFor(position, chapters.length);
    const work = moveChapterTo(state.work, from, to);
    return done({ ...state, work }, `Moved chapter ${chapterId} to position ${to + 1}.`);
  },
});

export const removeChapter = defineTool({
  name: 'remove_chapter',
  description:
    'Removes a chapter with every lesson and Quiz in it. Learner progress on them is lost when the course is next published, so only do this when the Educator asked for it.',
  input: z.strictObject({ chapterId }),
  run: (state, { chapterId }) => {
    const chapter = needChapter(state.work.course, chapterId);
    if (typeof chapter === 'string') return refuse(chapter);
    const work = deleteChapter(state.work, chapterId);
    const n = chapter.items.length;
    return done(
      { ...state, work },
      `Removed chapter ${named(chapter)} and the ${n} ${n === 1 ? 'item' : 'items'} in it.`,
    );
  },
});

export const addLesson = defineTool({
  name: 'add_lesson',
  description:
    'Adds an empty lesson to a chapter. Its id is made for you and returned; then fill it with set_blocks or add_block.',
  input: z.strictObject({ chapterId, title, ...lessonSettings, position: position.optional() }),
  run: (state, { chapterId, title, position, ...settings }, ctx) => {
    const chapter = needChapter(state.work.course, chapterId);
    if (typeof chapter === 'string') return refuse(chapter);
    const lessonId = idMaker(ctx, state.work)('lesson');
    let work = addEmptyLesson(state.work, chapterId, lessonId);
    work = setLesson(renameItem(work, lessonId, title), lessonId, settings);
    const placed = placeLast(work, chapterId, position);
    return done(
      { ...state, work: placed.work },
      `Added lesson ${lessonId} at position ${placed.to + 1} of chapter ${chapterId}.`,
    );
  },
});

export const addQuiz = defineTool({
  name: 'add_quiz',
  description:
    'Adds a Quiz to a chapter with its questions (at least one). Ids are made for you. questionsShown defaults to every question. Only ask about what lessons already teach.',
  input: z.strictObject({
    chapterId,
    title,
    questions: z.array(questionInput).min(1).max(60),
    ...quizSettings,
    position: position.optional(),
  }),
  run: (state, { chapterId, title, questions, position, ...settings }, ctx) => {
    const chapter = needChapter(state.work.course, chapterId);
    if (typeof chapter === 'string') return refuse(chapter);
    const makeId = idMaker(ctx, state.work);
    const quizId = makeId('quiz');
    const keyed: Keyed[] = [];
    for (const [i, q] of questions.entries()) {
      const built = buildQuestion(q, state.work.course, makeId);
      if (typeof built === 'string') return refuse(`Question ${i + 1}: ${built}`);
      keyed.push(built);
    }
    const shown = settings.questionsShown ?? questions.length;
    if (shown > questions.length)
      return refuse(`questionsShown is ${shown}, but the Quiz has ${questions.length} questions.`);
    let work = addEmptyQuiz(state.work, chapterId, quizId);
    work = keyed.reduce((w, k) => addQuestion(w, quizId, k), work);
    work = updateQuiz(work, quizId, (q) =>
      patch(q, { ...settingsPatch(settings), title, questionsShown: shown }),
    );
    const placed = placeLast(work, chapterId, position);
    return done(
      { ...state, work: placed.work },
      `Added Quiz ${quizId} with questions ${keyed.map((k) => k.question.id).join(', ')} at position ${placed.to + 1} of chapter ${chapterId}.`,
    );
  },
});

export const updateItem = defineTool({
  name: 'update_item',
  description:
    'Renames a lesson or Quiz, or changes a lesson’s settings (minutes, layout, how it is completed, label). Its id stays the same. For Quiz settings use update_quiz_settings.',
  input: z.strictObject({ itemId, title: title.optional(), ...lessonSettings }),
  run: (state, { itemId, title, ...settings }) => {
    const found = needItem(state.work.course, itemId);
    if (typeof found === 'string') return refuse(found);
    const lessonFields = Object.keys(settings);
    if (title === undefined && lessonFields.length === 0)
      return refuse('Give at least one field to change.');
    if (found.item.type === 'quiz' && lessonFields.length > 0)
      return refuse(
        `${lessonFields.join(', ')} are lesson settings, and "${itemId}" is a Quiz. Use update_quiz_settings.`,
      );
    let work = title === undefined ? state.work : renameItem(state.work, itemId, title);
    if (lessonFields.length > 0) work = setLesson(work, itemId, settings);
    return done({ ...state, work }, `Updated ${itemId}.`);
  },
});

export const moveItem = defineTool({
  name: 'move_item',
  description:
    'Moves a lesson or Quiz to another position, in its chapter or in another chapter. Its id, and so learner progress, stays.',
  input: z.strictObject({
    itemId,
    chapterId: chapterId.optional().describe('The chapter to move it to. Left out: its own.'),
    position: position.optional(),
  }),
  run: (state, { itemId, chapterId, position }) => {
    const found = needItem(state.work.course, itemId);
    if (typeof found === 'string') return refuse(found);
    const target = chapterId ?? found.chapter.id;
    if (target === found.chapter.id) {
      if (position === undefined) return refuse('Give a chapterId or a position to move it to.');
      const to = indexFor(position, found.chapter.items.length);
      const work = moveItemWithin(state.work, target, found.index, to);
      return done({ ...state, work }, `Moved ${itemId} to position ${to + 1}.`);
    }
    const chapter = needChapter(state.work.course, target);
    if (typeof chapter === 'string') return refuse(chapter);
    const placed = placeLast(moveItemToChapter(state.work, itemId, target), target, position);
    return done(
      { ...state, work: placed.work },
      `Moved ${itemId} to position ${placed.to + 1} of chapter ${target}.`,
    );
  },
});

export const removeItem = defineTool({
  name: 'remove_item',
  description:
    'Removes a lesson or Quiz (and a Quiz’s right answers). Learner progress on it is lost when the course is next published, so only do this when the Educator asked for it.',
  input: z.strictObject({ itemId }),
  run: (state, { itemId }) => {
    const found = needItem(state.work.course, itemId);
    if (typeof found === 'string') return refuse(found);
    const work = deleteItem(state.work, itemId);
    return done(
      { ...state, work },
      `Removed ${found.item.type === 'quiz' ? 'Quiz' : 'lesson'} ${named(found.item)}.`,
    );
  },
});

export const STRUCTURE_TOOLS = [
  addChapter,
  updateChapter,
  moveChapter,
  removeChapter,
  addLesson,
  addQuiz,
  updateItem,
  moveItem,
  removeItem,
];
