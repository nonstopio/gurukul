import { z } from 'zod';
import type { Course, Item, Parva } from './course';
import { timestamp } from './timestamp';

export const parikshaResultSchema = z.object({
  best: z.number().min(0).max(1),
  passed: z.boolean(),
  attempts: z.number().int().min(0),
  lastAttemptAt: timestamp,
});
export type ParikshaResult = z.infer<typeof parikshaResultSchema>;

export const progressSchema = z.object({
  uid: z.string().min(1),
  courseId: z.string().min(1),
  courseVersion: z.number().int().min(0),
  startedAt: timestamp,
  lastItemId: z.string().nullable(),
  lastActiveAt: timestamp,
  completedItemIds: z.array(z.string()),
  pariksha: z.record(z.string(), parikshaResultSchema),
  percent: z.number().min(0).max(100),
  completedAt: timestamp.nullable(),
  certificateId: z.string().nullable(),
});
export type Progress = z.infer<typeof progressSchema>;

/** `progress/{id}/attempts/{aid}`, written by `gradeAttempt`. `results` is absent on older attempts. */
export const attemptSchema = z.object({
  uid: z.string().min(1),
  courseId: z.string().min(1),
  parikshaId: z.string().min(1),
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
  pariksha: Readonly<Record<string, Pick<ParikshaResult, 'passed'>>>;
}

export type ItemState = 'done' | 'current' | 'locked' | 'todo';

/** Every lesson and Pariksha of a course, in reading order. */
export function itemsOf(course: Pick<Course, 'parvas'>): Item[] {
  return course.parvas.flatMap((p) => p.items);
}

/** Is this item finished? A lesson when marked complete, a Pariksha when passed. */
export function isItemDone(item: Item, state: ProgressState): boolean {
  return item.type === 'lesson'
    ? state.completedItemIds.includes(item.id)
    : state.pariksha[item.id]?.passed === true;
}

/**
 * (completed lessons + passed Parikshas) / (lessons + Parikshas) in the CURRENT version, rounded.
 * Ids that no longer exist are ignored; items added later count as not done. An empty course is 0.
 */
export function progressPercent(course: Pick<Course, 'parvas'>, state: ProgressState): number {
  const items = itemsOf(course);
  if (items.length === 0) return 0;
  const done = items.filter((i) => isItemDone(i, state)).length;
  return Math.round((done / items.length) * 100);
}

/**
 * Does this parva open the next one in a sequential course? When it has Parikshas, every one of
 * them is passed; when it has none, every lesson is done. An empty parva never holds anyone back.
 */
export function isParvaPassed(parva: Pick<Parva, 'items'>, state: ProgressState): boolean {
  const parikshas = parva.items.filter((i) => i.type === 'pariksha');
  const gate = parikshas.length > 0 ? parikshas : parva.items;
  return gate.every((i) => isItemDone(i, state));
}

/**
 * State of each item for the outline rail: done, current (the first unfinished item that is not
 * locked), todo, or locked. Two things lock: in a `sequential` course a parva stays locked until
 * the previous parva is passed (`isParvaPassed`); and an unfinished Pariksha that `blocksNext` locks
 * everything after it. A locked item that is already done stays done.
 */
export function itemStates(
  course: Pick<Course, 'parvas' | 'rules'>,
  state: ProgressState,
): Record<string, ItemState> {
  const out: Record<string, ItemState> = {};
  let currentTaken = false;
  let previousParvaDone = true;
  for (const parva of course.parvas) {
    const parvaLocked = course.rules.sequential && !previousParvaDone;
    let blocked = false;
    for (const item of parva.items) {
      if (isItemDone(item, state)) {
        out[item.id] = 'done';
        continue;
      }
      if (parvaLocked || blocked) {
        out[item.id] = 'locked';
        continue;
      }
      out[item.id] = currentTaken ? 'todo' : 'current';
      currentTaken = true;
      if (item.type === 'pariksha' && item.blocksNext) blocked = true;
    }
    previousParvaDone = isParvaPassed(parva, state);
  }
  return out;
}

/** The item to open when a learner presses Resume: the saved one if it still exists, else the first unfinished. */
export function resumeItemId(
  course: Pick<Course, 'parvas' | 'rules'>,
  state: ProgressState & { lastItemId: string | null },
): string | null {
  const items = itemsOf(course);
  if (state.lastItemId !== null && items.some((i) => i.id === state.lastItemId)) {
    return state.lastItemId;
  }
  const states = itemStates(course, state);
  return items.find((i) => states[i.id] === 'current')?.id ?? items[0]?.id ?? null;
}
