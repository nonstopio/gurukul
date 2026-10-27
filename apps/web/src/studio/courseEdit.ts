import { moveItem } from '@gurukul/ui';
import type { Course, Item, Lesson, Pariksha, Parva } from '@gurukul/schema';
import type { Working } from './types';

/**
 * Pure edits of a draft's structure. Each takes the working copy and returns a new one; nothing is
 * changed in place, and ids are passed in (`newId`) so the helpers stay deterministic. Learner
 * progress points at item ids, so an id is never reused or rewritten here.
 */

const withParvas = (w: Working, parvas: Parva[]): Working => ({
  ...w,
  course: { ...w.course, parvas },
});

const idsIn = (parvas: readonly Parva[]): string[] =>
  parvas.flatMap((p) => p.items.map((i) => i.id));

/** The answer keys without the given Pariksha ids: deleted Parikshas leave no orphaned keys. */
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

export function addParva(w: Working, id: string): Working {
  return withParvas(w, [...w.course.parvas, { id, title: 'New parva', items: [] }]);
}

export function renameParva(w: Working, parvaId: string, title: string): Working {
  return withParvas(
    w,
    w.course.parvas.map((p) => (p.id === parvaId ? { ...p, title } : p)),
  );
}

/** Removes a parva with everything in it, and the answer keys of its Parikshas. */
export function deleteParva(w: Working, parvaId: string): Working {
  const gone = w.course.parvas.find((p) => p.id === parvaId);
  const next = withParvas(
    w,
    w.course.parvas.filter((p) => p.id !== parvaId),
  );
  return { ...next, answers: withoutKeys(w.answers, gone ? idsIn([gone]) : []) };
}

export function moveParva(w: Working, from: number, to: number): Working {
  return withParvas(w, moveItem(w.course.parvas, from, to));
}

const appendItem = (w: Working, parvaId: string, item: Item): Working =>
  withParvas(
    w,
    w.course.parvas.map((p) => (p.id === parvaId ? { ...p, items: [...p.items, item] } : p)),
  );

/** An empty lesson at the end of a parva: stacked, completed by hand, five minutes. */
export function addLesson(w: Working, parvaId: string, id: string): Working {
  const lesson: Lesson = {
    type: 'lesson',
    id,
    title: 'Untitled lesson',
    minutes: 5,
    layout: 'stacked',
    completeWhen: 'manual',
    blocks: [],
  };
  return appendItem(w, parvaId, lesson);
}

/** An empty Pariksha at the end of a parva, with the defaults most courses want. */
export function addPariksha(w: Working, parvaId: string, id: string): Working {
  const pariksha: Pariksha = {
    type: 'pariksha',
    id,
    title: 'Untitled Pariksha',
    questionsShown: 1,
    shuffleOptions: true,
    cooldownMinutes: 10,
    revealAnswers: 'each',
    blocksNext: true,
    questions: [],
  };
  return appendItem(w, parvaId, pariksha);
}

/** Removes one lesson or Pariksha, and its answer keys. */
export function deleteItem(w: Working, itemId: string): Working {
  const next = withParvas(
    w,
    w.course.parvas.map((p) => ({ ...p, items: p.items.filter((i) => i.id !== itemId) })),
  );
  return { ...next, answers: withoutKeys(w.answers, [itemId]) };
}

/** Reorders the items of one parva. */
export function moveItemWithin(w: Working, parvaId: string, from: number, to: number): Working {
  return withParvas(
    w,
    w.course.parvas.map((p) =>
      p.id === parvaId ? { ...p, items: moveItem(p.items, from, to) } : p,
    ),
  );
}

/** Moves an item to the end of another parva. An unknown item or parva, or the same parva, changes nothing. */
export function moveItemToParva(w: Working, itemId: string, targetParvaId: string): Working {
  const source = w.course.parvas.find((p) => p.items.some((i) => i.id === itemId));
  const item = source?.items.find((i) => i.id === itemId);
  if (!source || !item || source.id === targetParvaId) return w;
  if (!w.course.parvas.some((p) => p.id === targetParvaId)) return w;
  return withParvas(
    w,
    w.course.parvas.map((p) => {
      if (p.id === source.id) return { ...p, items: p.items.filter((i) => i.id !== itemId) };
      return p.id === targetParvaId ? { ...p, items: [...p.items, item] } : p;
    }),
  );
}
