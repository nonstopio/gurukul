import { z } from 'zod';
import type { Course, Item } from './course';
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

/** The document id of one learner's progress in one course. */
export const progressId = (uid: string, courseId: string): string => `${uid}_${courseId}`;

/** What a learner has done, as far as the percent and item states are concerned. */
export type ProgressState = Pick<Progress, 'completedItemIds' | 'pariksha'>;

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
 * State of each item for the outline rail. With `sequential`, an item after an unfinished
 * Pariksha that blocks the next one is locked; everything else is done, current (the first
 * unfinished item) or todo.
 */
export function itemStates(
  course: Pick<Course, 'parvas' | 'rules'>,
  state: ProgressState,
): Record<string, ItemState> {
  const out: Record<string, ItemState> = {};
  let blocked = false;
  let currentTaken = false;
  for (const item of itemsOf(course)) {
    if (isItemDone(item, state)) {
      out[item.id] = 'done';
      continue;
    }
    if (blocked) {
      out[item.id] = 'locked';
      continue;
    }
    if (!currentTaken) {
      out[item.id] = 'current';
      currentTaken = true;
    } else {
      out[item.id] = 'todo';
    }
    if (course.rules.sequential && item.type === 'pariksha' && item.blocksNext) blocked = true;
  }
  return out;
}
