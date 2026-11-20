import type { Working } from '../../types';
import type { Chapter, Course, Item, Lesson, Quiz } from '@gurukul/schema';
import { newId } from '../../ids';
import type { SessionState, ToolContext } from './types';

/** Where an item sits: its chapter and its index in that chapter, from 0. */
export interface Located<T extends Item = Item> {
  chapter: Chapter;
  chapterIndex: number;
  item: T;
  index: number;
}

export function locate(course: Course, itemId: string): Located | null {
  for (const [chapterIndex, chapter] of course.chapters.entries()) {
    const index = chapter.items.findIndex((i) => i.id === itemId);
    const item = chapter.items[index];
    if (item) return { chapter, chapterIndex, item, index };
  }
  return null;
}

const SEE_IDS = 'Call get_course to see the ids.';

/** The chapter, or the sentence to refuse with. */
export function needChapter(course: Course, chapterId: string): Chapter | string {
  return (
    course.chapters.find((p) => p.id === chapterId) ??
    `There is no chapter with id "${chapterId}". ${SEE_IDS}`
  );
}

export function needItem(course: Course, itemId: string): Located | string {
  return locate(course, itemId) ?? `There is no lesson or Quiz with id "${itemId}". ${SEE_IDS}`;
}

export function needLesson(course: Course, lessonId: string): Located<Lesson> | string {
  const found = needItem(course, lessonId);
  if (typeof found === 'string') return found;
  if (found.item.type !== 'lesson')
    return `"${lessonId}" is a Quiz, not a lesson. Use the Quiz tools for it.`;
  return found as Located<Lesson>;
}

export function needQuiz(course: Course, quizId: string): Located<Quiz> | string {
  const found = needItem(course, quizId);
  if (typeof found === 'string') return found;
  if (found.item.type !== 'quiz')
    return `"${quizId}" is a lesson, not a Quiz. Use the lesson and block tools for it.`;
  return found as Located<Quiz>;
}

/** Every id already used in the course (chapters, items, blocks, questions, options) and the to-dos. */
function usedIds(work: Working, state?: SessionState): Set<string> {
  const ids = new Set<string>(state?.todos.map((t) => t.id));
  for (const chapter of work.course.chapters) {
    ids.add(chapter.id);
    for (const item of chapter.items) {
      ids.add(item.id);
      if (item.type === 'lesson') for (const b of item.blocks) ids.add(b.id);
      else
        for (const q of item.questions) {
          ids.add(q.id);
          for (const o of q.options) ids.add(o.id);
        }
    }
  }
  return ids;
}

/**
 * Makes new ids for one tool call: never the model's, never one the course or the to-dos already
 * use, never the same twice within the call. Ids are `newId(prefix)`, as Studio's editors make them.
 */
export function idMaker(
  ctx: ToolContext,
  work: Working,
  state?: SessionState,
): (prefix: string) => string {
  const taken = usedIds(work, state);
  return (prefix) => {
    let id = newId(prefix, ctx.random);
    while (taken.has(id)) id = newId(prefix, ctx.random);
    taken.add(id);
    return id;
  };
}

/** A 1-based position from the model as a 0-based index, kept within `0..length - 1 + extra`. */
export function indexFor(position: number | undefined, length: number, extra = 0): number {
  const last = length - 1 + extra;
  if (position === undefined) return Math.max(last, 0);
  return Math.min(Math.max(position - 1, 0), Math.max(last, 0));
}

/** The title to show the model for an item: its title, or its id when the title is empty. */
export const named = (item: { id: string; title: string }): string =>
  item.title.trim() === '' ? `"${item.id}"` : `"${item.title}" (${item.id})`;
