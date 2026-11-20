import { COURSE_FIELDS, LANDING_FIELDS, read } from '@gurukul/schema/changes';
import type { ChangeRow, FieldSpec } from '@gurukul/schema/changes';
import type { Chapter, Course, Item } from '@gurukul/schema';
import { markAnswerEdits } from '../studioModel';
import type { Working } from '../types';

/*
 * Review's "Undo this item" (`.plan/22-desktop-studio.md`, Acting on a row): one row of the change
 * list put back as the base has it, everything else left as the session made it. Pure, so the
 * screen only asks and the runtime writes the result as a turn by the Educator.
 *
 * Something that only changed is put back where it is, so entries the session added around it stay
 * where it put them. Something removed or moved goes back right after the nearest entry before it
 * in the base that is still in that list (first when there is none): the rule Review uses to place
 * a removed entry, so it lands where the Educator saw it.
 */

/** Why a row cannot be put back, for the screen to say in words. */
export type RevertRefusal =
  /** A new course has no draft to go back to. */
  | 'no_base'
  /** The id is used twice, so which one is meant is not clear. */
  | 'repeated'
  /** An added chapter still holds lessons or Quizzes: undo those first. */
  | 'not_empty'
  /** The chapter a removed item belonged to is gone too: undo the chapter first. */
  | 'chapter_gone'
  /**
   * A removed lesson's id is a Quiz's now, or the other way round: putting it back would use the
   * id twice, which publishing refuses. Undo the one that took its place first.
   */
  | 'id_taken';

export type RevertResult = { ok: true; work: Working } | { ok: false; reason: RevertRefusal };

/** Rows that can be offered Undo: every row of an edit session, except a repeated id's. */
export function canRevert(base: Working | null, row: ChangeRow): boolean {
  return base !== null && !row.key.includes('#');
}

/** `value` with the dotted `path` set to `next`; an undefined `next` removes the key. */
function setAt<T>(value: T, path: string, next: unknown): T {
  const [head, ...rest] = path.split('.') as [string, ...string[]];
  const was = value as Record<string, unknown>;
  const inner = rest.length === 0 ? next : setAt(was[head], rest.join('.'), next);
  const own = Object.fromEntries(Object.entries(was).filter(([key]) => key !== head));
  if (inner !== undefined) own[head] = inner;
  return own as T;
}

/** The course with every field of `spec` as the base has it. */
const fieldsFrom = (spec: FieldSpec, base: Course, course: Course): Course =>
  spec.reduce((c, [field]) => setAt(c, field, read(base, field)), course);

/**
 * `entry` inserted into `list` right after the nearest entry before it in `baseList` that `list`
 * holds (matched by `key`), or first.
 */
function placeAfter<T>(
  list: readonly T[],
  entry: T,
  baseList: readonly T[],
  key: (e: T) => string,
) {
  const at = baseList.findIndex((e) => key(e) === key(entry));
  const present = new Set(list.map(key));
  const anchor = baseList
    .slice(0, at)
    .reverse()
    .find((e) => present.has(key(e)));
  const index = anchor === undefined ? 0 : list.findIndex((e) => key(e) === key(anchor)) + 1;
  return [...list.slice(0, index), entry, ...list.slice(index)];
}

const itemKey = (item: Item) => `${item.type}:${item.id}`;
const chapterKey = (chapter: Chapter) => chapter.id;

/** Where an item is: its chapter's index and its own, or null. */
function find(course: Course, key: string): { c: number; i: number } | null {
  for (const [c, chapter] of course.chapters.entries()) {
    const i = chapter.items.findIndex((item) => itemKey(item) === key);
    if (i >= 0) return { c, i };
  }
  return null;
}

const withChapters = (course: Course, chapters: Chapter[]): Course => ({ ...course, chapters });

function revertChapter(base: Course, course: Course, row: Extract<ChangeRow, { kind: 'chapter' }>) {
  const now = course.chapters.find((c) => c.id === row.id);
  if (row.statuses.includes('added')) {
    // An added chapter is there, or it would not be a row.
    if ((now as Chapter).items.length > 0) return null;
    return withChapters(
      course,
      course.chapters.filter((c) => c.id !== row.id),
    );
  }
  const was = row.before as Chapter;
  if (row.statuses.includes('removed')) {
    // Its lessons and Quizzes that are elsewhere now stay where they are.
    const items = was.items.filter((item) => find(course, itemKey(item)) === null);
    return withChapters(
      course,
      placeAfter(course.chapters, { ...was, items }, base.chapters, chapterKey),
    );
  }
  // Renamed, moved, or both: the old title, and the old place.
  const back = { ...(now as Chapter), title: was.title };
  if (!row.statuses.includes('moved'))
    return withChapters(
      course,
      course.chapters.map((c) => (c.id === row.id ? back : c)),
    );
  const others = course.chapters.filter((c) => c.id !== row.id);
  return withChapters(course, placeAfter(others, back, base.chapters, chapterKey));
}

function revertItem(
  base: Working,
  work: Working,
  row: Extract<ChangeRow, { kind: 'lesson' | 'quiz' }>,
): RevertResult {
  const key = `${row.kind}:${row.id}`;
  const course = work.course;
  // A Quiz's keys go back with it: the base's, or none.
  const answers =
    row.kind === 'quiz'
      ? {
          ...Object.fromEntries(Object.entries(work.answers).filter(([id]) => id !== row.id)),
          ...(base.answers[row.id]
            ? { [row.id]: base.answers[row.id] as Working['answers'][string] }
            : {}),
        }
      : work.answers;
  // Out of wherever it is now.
  const here = find(course, key);
  const other = `${row.kind === 'lesson' ? 'quiz' : 'lesson'}:${row.id}`;
  if (!here && find(course, other)) return { ok: false, reason: 'id_taken' };
  const chapters = course.chapters.map((chapter, c) =>
    c === here?.c ? { ...chapter, items: chapter.items.filter((_, i) => i !== here.i) } : chapter,
  );
  if (row.statuses.includes('added'))
    return { ok: true, work: { ...work, course: withChapters(course, chapters), answers } };

  // Back into the chapter it was in, as it was.
  const was = row.before as Item;
  const baseAt = find(base.course, key) as { c: number; i: number };
  const baseChapter = base.course.chapters[baseAt.c] as Chapter;
  const target = chapters.findIndex((c) => c.id === baseChapter.id);
  // Only changed, or its chapter is gone while it is still in the course: its content back where
  // it is, so what the session added around it keeps its place.
  if (here && (target < 0 || (target === here.c && !row.statuses.includes('moved')))) {
    const kept = course.chapters.map((chapter, c) =>
      c === here.c
        ? { ...chapter, items: chapter.items.map((item, i) => (i === here.i ? was : item)) }
        : chapter,
    );
    return { ok: true, work: { ...work, course: withChapters(course, kept), answers } };
  }
  if (target < 0) return { ok: false, reason: 'chapter_gone' };
  const chapter = chapters[target] as Chapter;
  const items = placeAfter(chapter.items, was, baseChapter.items, itemKey);
  chapters[target] = { ...chapter, items };
  return { ok: true, work: { ...work, course: withChapters(course, chapters), answers } };
}

/**
 * The working copy with one row put back as the base has it: course details and landing page
 * field by field, a chapter's title and place (an added one removed when empty, a removed one back
 * with its lessons that are not elsewhere now), a lesson or Quiz whole, with its answer keys and in
 * its old place. `answersChanged` is marked as Studio marks it.
 */
export function revertRow(base: Working | null, work: Working, row: ChangeRow): RevertResult {
  if (base === null) return { ok: false, reason: 'no_base' };
  if (!canRevert(base, row)) return { ok: false, reason: 'repeated' };
  let result: RevertResult;
  switch (row.kind) {
    case 'course':
      result = {
        ok: true,
        work: { ...work, course: fieldsFrom(COURSE_FIELDS, base.course, work.course) },
      };
      break;
    case 'landing':
      result = {
        ok: true,
        work: {
          ...work,
          course: {
            ...fieldsFrom(LANDING_FIELDS, base.course, work.course),
            outcomes: base.course.outcomes,
          },
        },
      };
      break;
    case 'chapter': {
      const course = revertChapter(base.course, work.course, row);
      result = course
        ? { ok: true, work: { ...work, course } }
        : { ok: false, reason: 'not_empty' };
      break;
    }
    default:
      result = revertItem(base, work, row);
  }
  return result.ok ? { ok: true, work: markAnswerEdits(result.work, base) } : result;
}
