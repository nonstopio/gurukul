import { moveItem } from '@gurukul/ui';
import type { Course, Item, Lesson, Quiz, Chapter } from '@gurukul/schema';
import type { Working } from './types';

/**
 * Pure edits of a draft's structure. Each takes the working copy and returns a new one; nothing is
 * changed in place, and ids are passed in (`newId`) so the helpers stay deterministic. Learner
 * progress points at item ids, so an id is never reused or rewritten here.
 */

const withChapters = (w: Working, chapters: Chapter[]): Working => ({
  ...w,
  course: { ...w.course, chapters },
});

const idsIn = (chapters: readonly Chapter[]): string[] =>
  chapters.flatMap((p) => p.items.map((i) => i.id));

/** The answer keys without the given Quiz ids: deleted Quizzes leave no orphaned keys. */
const withoutKeys = (answers: Working['answers'], ids: readonly string[]): Working['answers'] =>
  Object.fromEntries(Object.entries(answers).filter(([id]) => !ids.includes(id)));

/** A copy of the course with some top-level fields replaced. */
export function patchCourse(w: Working, patch: Partial<Course>): Working {
  return { ...w, course: { ...w.course, ...patch } };
}

export function setRule(
  w: Working,
  key: 'sequential' | 'certificate' | 'requireVideoWatch',
  on: boolean,
): Working {
  return patchCourse(w, { rules: { ...w.course.rules, [key]: on } });
}

/** Sets the pass mark from a whole percent; anything that is not a number is ignored, the rest is clamped to 0-100. */
export function setPassMark(w: Working, percent: number): Working {
  if (Number.isNaN(percent)) return w;
  const clamped = Math.min(100, Math.max(0, Math.round(percent)));
  return patchCourse(w, { rules: { ...w.course.rules, passMark: clamped / 100 } });
}

export function setCertificate(w: Working, patch: Partial<Course['certificate']>): Working {
  return patchCourse(w, { certificate: { ...w.course.certificate, ...patch } });
}

export function setCoverTheme(w: Working, theme: Course['cover']['theme']): Working {
  return patchCourse(w, { cover: { ...w.course.cover, theme } });
}

/** Replaces one learning outcome. */
export function setOutcome(w: Working, index: number, text: string): Working {
  return patchCourse(w, { outcomes: w.course.outcomes.map((o, i) => (i === index ? text : o)) });
}

export function addOutcome(w: Working): Working {
  return patchCourse(w, { outcomes: [...w.course.outcomes, ''] });
}

export function removeOutcome(w: Working, index: number): Working {
  return patchCourse(w, { outcomes: w.course.outcomes.filter((_, i) => i !== index) });
}

export function addChapter(w: Working, id: string): Working {
  return withChapters(w, [...w.course.chapters, { id, title: 'New chapter', items: [] }]);
}

export function renameChapter(w: Working, chapterId: string, title: string): Working {
  return withChapters(
    w,
    w.course.chapters.map((p) => (p.id === chapterId ? { ...p, title } : p)),
  );
}

/** Removes a chapter with everything in it, and the answer keys of its Quizzes. */
export function deleteChapter(w: Working, chapterId: string): Working {
  const gone = w.course.chapters.find((p) => p.id === chapterId);
  const next = withChapters(
    w,
    w.course.chapters.filter((p) => p.id !== chapterId),
  );
  return { ...next, answers: withoutKeys(w.answers, gone ? idsIn([gone]) : []) };
}

export function moveChapter(w: Working, from: number, to: number): Working {
  return withChapters(w, moveItem(w.course.chapters, from, to));
}

const appendItem = (w: Working, chapterId: string, item: Item): Working =>
  withChapters(
    w,
    w.course.chapters.map((p) => (p.id === chapterId ? { ...p, items: [...p.items, item] } : p)),
  );

/** An empty lesson at the end of a chapter: stacked, completed by hand, five minutes. */
export function addLesson(w: Working, chapterId: string, id: string): Working {
  const lesson: Lesson = {
    type: 'lesson',
    id,
    title: 'Untitled lesson',
    minutes: 5,
    layout: 'stacked',
    completeWhen: 'manual',
    blocks: [],
  };
  return appendItem(w, chapterId, lesson);
}

/** An empty Quiz at the end of a chapter, with the defaults most courses want. */
export function addQuiz(w: Working, chapterId: string, id: string): Working {
  const quiz: Quiz = {
    type: 'quiz',
    id,
    title: 'Untitled Quiz',
    questionsShown: 1,
    shuffleOptions: true,
    cooldownMinutes: 10,
    revealAnswers: 'each',
    blocksNext: true,
    questions: [],
  };
  return appendItem(w, chapterId, quiz);
}

/** Renames one lesson or Quiz. The id stays, so learner progress follows the new title. */
export function renameItem(w: Working, itemId: string, title: string): Working {
  return withChapters(
    w,
    w.course.chapters.map((p) => ({
      ...p,
      items: p.items.map((i) => (i.id === itemId ? { ...i, title } : i)),
    })),
  );
}

/** Removes one lesson or Quiz, and its answer keys. */
export function deleteItem(w: Working, itemId: string): Working {
  const next = withChapters(
    w,
    w.course.chapters.map((p) => ({ ...p, items: p.items.filter((i) => i.id !== itemId) })),
  );
  return { ...next, answers: withoutKeys(w.answers, [itemId]) };
}

/** Reorders the items of one chapter. */
export function moveItemWithin(w: Working, chapterId: string, from: number, to: number): Working {
  return withChapters(
    w,
    w.course.chapters.map((p) =>
      p.id === chapterId ? { ...p, items: moveItem(p.items, from, to) } : p,
    ),
  );
}

/** Moves an item to the end of another chapter. An unknown item or chapter, or the same chapter, changes nothing. */
export function moveItemToChapter(w: Working, itemId: string, targetChapterId: string): Working {
  const source = w.course.chapters.find((p) => p.items.some((i) => i.id === itemId));
  const item = source?.items.find((i) => i.id === itemId);
  if (!source || !item || source.id === targetChapterId) return w;
  if (!w.course.chapters.some((p) => p.id === targetChapterId)) return w;
  return withChapters(
    w,
    w.course.chapters.map((p) => {
      if (p.id === source.id) return { ...p, items: p.items.filter((i) => i.id !== itemId) };
      return p.id === targetChapterId ? { ...p, items: [...p.items, item] } : p;
    }),
  );
}
