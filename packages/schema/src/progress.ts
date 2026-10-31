import { z } from 'zod';
import type { Course, Item, Chapter } from './course';
import { timestamp } from './timestamp';

export const quizResultSchema = z.object({
  best: z.number().min(0).max(1),
  passed: z.boolean(),
  attempts: z.number().int().min(0),
  lastAttemptAt: timestamp,
});
export type QuizResult = z.infer<typeof quizResultSchema>;

export const progressSchema = z.object({
  uid: z.string().min(1),
  courseId: z.string().min(1),
  courseVersion: z.number().int().min(0),
  startedAt: timestamp,
  lastItemId: z.string().nullable(),
  lastActiveAt: timestamp,
  completedItemIds: z.array(z.string()),
  quiz: z.record(z.string(), quizResultSchema),
  percent: z.number().min(0).max(100),
  completedAt: timestamp.nullable(),
  certificateId: z.string().nullable(),
});
export type Progress = z.infer<typeof progressSchema>;

/** `progress/{id}/attempts/{aid}`, written by `gradeAttempt`. `results` is absent on older attempts. */
export const attemptSchema = z.object({
  uid: z.string().min(1),
  courseId: z.string().min(1),
  quizId: z.string().min(1),
  score: z.number().min(0).max(1),
  passed: z.boolean().default(false),
  results: z.array(z.object({ questionId: z.string(), correct: z.boolean() })).default([]),
});
export type Attempt = z.infer<typeof attemptSchema>;

/** The document id of one learner's progress in one course. */
export const progressId = (uid: string, courseId: string): string => `${uid}_${courseId}`;

/** What a learner has done, as far as the percent and item states are concerned. */
export interface ProgressState {
  completedItemIds: readonly string[];
  quiz: Readonly<Record<string, Pick<QuizResult, 'passed'>>>;
}

export type ItemState = 'done' | 'current' | 'locked' | 'todo';

/** Every lesson and Quiz of a course, in reading order. */
export function itemsOf(course: Pick<Course, 'chapters'>): Item[] {
  return course.chapters.flatMap((p) => p.items);
}

/** Is this item finished? A lesson when marked complete, a Quiz when passed. */
export function isItemDone(item: Item, state: ProgressState): boolean {
  return item.type === 'lesson'
    ? state.completedItemIds.includes(item.id)
    : state.quiz[item.id]?.passed === true;
}

/**
 * (completed lessons + passed Quizzes) / (lessons + Quizzes) in the CURRENT version, rounded.
 * Ids that no longer exist are ignored; items added later count as not done. An empty course is 0.
 */
export function progressPercent(course: Pick<Course, 'chapters'>, state: ProgressState): number {
  const items = itemsOf(course);
  if (items.length === 0) return 0;
  const done = items.filter((i) => isItemDone(i, state)).length;
  return Math.round((done / items.length) * 100);
}

/**
 * Does this chapter open the next one in a sequential course? When it has Quizzes, every one of
 * them is passed; when it has none, every lesson is done. An empty chapter never holds anyone back.
 */
export function isChapterPassed(chapter: Pick<Chapter, 'items'>, state: ProgressState): boolean {
  const quizzes = chapter.items.filter((i) => i.type === 'quiz');
  const gate = quizzes.length > 0 ? quizzes : chapter.items;
  return gate.every((i) => isItemDone(i, state));
}

/**
 * State of each item for the outline rail: done, current (the first unfinished item that is not
 * locked), todo, or locked. Two things lock: in a `sequential` course a chapter stays locked until
 * the previous chapter is passed (`isChapterPassed`); and an unfinished Quiz that `blocksNext` locks
 * everything after it. A locked item that is already done stays done.
 */
export function itemStates(
  course: Pick<Course, 'chapters' | 'rules'>,
  state: ProgressState,
): Record<string, ItemState> {
  const out: Record<string, ItemState> = {};
  let currentTaken = false;
  let previousChapterDone = true;
  for (const chapter of course.chapters) {
    const chapterLocked = course.rules.sequential && !previousChapterDone;
    let blocked = false;
    for (const item of chapter.items) {
      if (isItemDone(item, state)) {
        out[item.id] = 'done';
        continue;
      }
      if (chapterLocked || blocked) {
        out[item.id] = 'locked';
        continue;
      }
      out[item.id] = currentTaken ? 'todo' : 'current';
      currentTaken = true;
      if (item.type === 'quiz' && item.blocksNext) blocked = true;
    }
    previousChapterDone = isChapterPassed(chapter, state);
  }
  return out;
}

/** The item to open when a learner presses Resume: the saved one if it still exists, else the first unfinished. */
export function resumeItemId(
  course: Pick<Course, 'chapters' | 'rules'>,
  state: ProgressState & { lastItemId: string | null },
): string | null {
  const items = itemsOf(course);
  const states = itemStates(course, state);
  // A saved item that is locked now (a Quiz was added before it) is not somewhere to resume.
  if (
    state.lastItemId !== null &&
    items.some((i) => i.id === state.lastItemId) &&
    states[state.lastItemId] !== 'locked'
  ) {
    return state.lastItemId;
  }
  return items.find((i) => states[i.id] === 'current')?.id ?? items[0]?.id ?? null;
}
