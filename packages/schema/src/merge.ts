import {
  COURSE_FIELDS,
  LANDING_FIELDS,
  courseChanges,
  keyed,
  lcs,
  locate,
  read,
  stable,
} from './changes';
import type { ChangeRow, CourseCopy, Location } from './changes';
import type { Chapter, Course, Item } from './course';
import type { AnswerKeys } from './draft';
import type { WorkingCopy } from './session';

/*
 * "Bring in their changes" (`.plan/22-desktop-studio.md`, "Save to draft", when the draft moved
 * underneath): a three-way merge of a Desktop Studio session's working copy ("mine") with the
 * draft someone saved after the session started ("theirs"), both measured against the draft the
 * session started from ("base").
 *
 * Things are matched as the Review matches them (`changes.ts`): chapters by id, lessons and
 * Quizzes by type and id, repeated ids in order of occurrence. Whether an item changed on a side is
 * whatever the Review would show as Changed (`courseChanges`), answer keys included, so a merge
 * never disagrees with the rows the Educator reviewed.
 */

/** Which copy a conflict is settled from: the session's working copy, or the stored draft. */
export type Side = 'mine' | 'theirs';

/**
 * Why two copies disagree: `both` changed (or both added) the same thing differently;
 * `removedInMine` and `removedInTheirs`: one side removed what the other changed.
 */
export type ConflictReason = 'both' | 'removedInMine' | 'removedInTheirs';

/**
 * One thing changed on both sides, for the Educator to settle with Keep this session's
 * (`mine`) or Keep theirs (`theirs`). `key` is unique in the result and follows the Review's row
 * keys: `chapter:p1`, `lesson:l2`, `quiz:q1` (a repeated id gets `#2`…), and `field:<path>` for a
 * course details or landing page field. `base`, `mine` and `theirs` are the three versions; null
 * (an item or chapter) or undefined (a field) where that copy has none.
 */
export type MergeConflict =
  | {
      key: string;
      kind: 'field';
      /** The Review row the field belongs to. */
      row: 'course' | 'landing';
      /** Dotted path, as in `FieldChange.field`: `title`, `rules.passMark`, `outcomes`. */
      field: string;
      reason: 'both';
      base: unknown;
      mine: unknown;
      theirs: unknown;
    }
  | {
      key: string;
      kind: 'chapter';
      id: string;
      reason: ConflictReason;
      base: Chapter | null;
      mine: Chapter | null;
      theirs: Chapter | null;
    }
  | {
      key: string;
      kind: 'lesson' | 'quiz';
      id: string;
      /** The chapter it sits in on the side that has it (this session's when both do). */
      chapterId: string;
      reason: ConflictReason;
      base: Item | null;
      mine: Item | null;
      theirs: Item | null;
    };

/**
 * A list whose order changed on both sides, differently: this session's order was kept, and the
 * page says so. `items` names the chapter whose lessons and Quizzes it is about.
 */
export type OrderKept = { list: 'chapters' } | { list: 'items'; chapterId: string };

/** What `mergeWorking` found; hand it to `resolveConflicts` with a choice per conflict. */
export interface MergeResult {
  base: CourseCopy;
  mine: CourseCopy;
  theirs: CourseCopy;
  /** In course order: course details and landing page fields, then chapters, then items. */
  conflicts: MergeConflict[];
  orderKept: OrderKept[];
  /** The merged copy when there is nothing to choose; null until `resolveConflicts` settles them. */
  working: WorkingCopy | null;
}

/** For each conflict key, the side to keep. */
export type ConflictChoices = Readonly<Record<string, Side>>;

// ─── Small helpers ───────────────────────────────────────────────────────────────────────────────

/** Keys of several lists, each once, in the order first met. */
const union = (...lists: readonly (readonly string[])[]) => [...new Set(lists.flat())];

/** A copy of `value` with `path` set (or removed, for undefined); nothing it shares is changed. */
function written(
  value: Record<string, unknown>,
  path: readonly string[],
  v: unknown,
): Record<string, unknown> {
  const [head, ...rest] = path as [string, ...string[]];
  if (rest.length > 0)
    return { ...value, [head]: written(value[head] as Record<string, unknown>, rest, v) };
  if (v !== undefined) return { ...value, [head]: v };
  return Object.fromEntries(Object.entries(value).filter(([k]) => k !== head));
}

/** Three-way pick of one value: the side that changed it, or null when both did, differently. */
function pick3(base: unknown, mine: unknown, theirs: unknown): { value: unknown } | null {
  const b = stable(base);
  if (stable(mine) === b) return { value: theirs };
  if (stable(theirs) === b || stable(mine) === stable(theirs)) return { value: mine };
  return null;
}

/** A Quiz's keys per question, as sets (order and repeats ignored, as the Review does). */
const keysOf = (answers: AnswerKeys, item: Item) =>
  item.type === 'quiz'
    ? item.questions.map((q) => [...new Set(answers[item.id]?.[q.id] ?? [])].sort())
    : null;

/** A conflict key in the Review's row style: the NUL-numbered repeat `x\0002` becomes `x#2`. */
const rowKey = (key: string) => key.replace('\u0000', '#');

/** One copy, indexed: chapters and items by their merge key, and the rows it differs from the base by. */
interface Indexed {
  chapters: Map<string, Chapter>;
  chapterOrder: string[];
  items: Map<string, Location>;
  itemOrder: string[];
  /** Lesson and Quiz rows of `courseChanges(base, copy)`, by the item they describe in this copy. */
  rows: Map<Item, ChangeRow>;
}

function indexed(copy: CourseCopy, base: CourseCopy | null): Indexed {
  const chapters = keyed(copy.course.chapters, (c) => c.id);
  const items = locate(copy.course);
  const rows = new Map<Item, ChangeRow>();
  if (base)
    for (const row of courseChanges(base, copy).rows)
      if ((row.kind === 'lesson' || row.kind === 'quiz') && row.after) rows.set(row.after, row);
  return {
    chapters: new Map(chapters.map((c) => [c.key, c.entry])),
    chapterOrder: chapters.map((c) => c.key),
    items: new Map(items.map((at) => [at.key, at])),
    itemOrder: items.map((at) => at.key),
    rows,
  };
}

const has = (side: Indexed, at: Location, status: 'changed' | 'moved') =>
  side.rows.get(at.item)?.statuses.includes(status) ?? false;

// ─── Order ───────────────────────────────────────────────────────────────────────────────────────

/**
 * Did a side reorder this list? Yes when the entries it shares with the base are out of the base's
 * order (longest common subsequence, as the Review decides Moved), or it brought in an entry that
 * sat elsewhere in the base (`known`).
 */
function reordered(base: readonly string[], side: readonly string[], known: ReadonlySet<string>) {
  const inBase = new Set(base);
  const shared = side.filter((k) => inBase.has(k));
  const sharedBase = base.filter((k) => shared.includes(k));
  return (
    lcs(sharedBase, shared).length < shared.length ||
    side.some((k) => known.has(k) && !inBase.has(k))
  );
}

/**
 * One list from two sides that both hold only the entries the merge keeps. The side that reordered
 * gives the order (this session's when both did); the other side's own entries go right after the
 * nearest entry before them on their side, or first. `kept` is true when both reordered, differently.
 */
function mergeOrder(
  base: readonly string[],
  mine: readonly string[],
  theirs: readonly string[],
  known: ReadonlySet<string>,
): { order: string[]; kept: boolean } {
  const byMine = reordered(base, mine, known);
  const byTheirs = reordered(base, theirs, known);
  const kept =
    byMine &&
    byTheirs &&
    stable(mine.filter((k) => theirs.includes(k))) !==
      stable(theirs.filter((k) => mine.includes(k)));
  const order: string[] = [];
  for (const list of byMine || !byTheirs ? [mine, theirs] : [theirs, mine])
    list.forEach((k, i) => {
      if (order.includes(k)) return;
      const before = list.slice(0, i).findLast((p) => order.includes(p));
      order.splice(before === undefined ? 0 : order.indexOf(before) + 1, 0, k);
    });
  return { order, kept };
}

// ─── The merge ───────────────────────────────────────────────────────────────────────────────────

/** The fields merged one by one: course details, then the landing page, as the Review lists them. */
const FIELDS: readonly (readonly ['course' | 'landing', string])[] = [
  ...COURSE_FIELDS.map(([f]) => ['course', f] as const),
  ...LANDING_FIELDS.map(([f]) => ['landing', f] as const),
  ['landing', 'outcomes'],
];

/** A kept lesson or Quiz: its content, the copy its answer keys come from, and its chapter. */
interface Kept {
  item: Item;
  from: CourseCopy;
  chapter: string;
}

function merge(
  base: CourseCopy,
  mine: CourseCopy,
  theirs: CourseCopy,
  choose: (conflict: MergeConflict) => Side,
): { conflicts: MergeConflict[]; orderKept: OrderKept[]; working: WorkingCopy } {
  const conflicts: MergeConflict[] = [];
  const decide = (conflict: MergeConflict) => {
    conflicts.push(conflict);
    return choose(conflict);
  };
  const orderKept: OrderKept[] = [];
  const B = indexed(base, null);
  const M = indexed(mine, base);
  const T = indexed(theirs, base);
  const sides = { mine: M, theirs: T };

  // Course details and the landing page, field by field. Everything else on the course (id,
  // version, status, publishedAt, Educators, schemaVersion) is Studio's and publishing's to keep:
  // it comes from the stored draft.
  let course = theirs.course as unknown as Record<string, unknown>;
  for (const [row, field] of FIELDS) {
    const b = read(base.course, field);
    const m = read(mine.course, field);
    const t = read(theirs.course, field);
    const picked = pick3(b, m, t);
    const value = picked
      ? picked.value
      : decide({
            key: `field:${field}`,
            kind: 'field',
            row,
            field,
            reason: 'both',
            base: b,
            mine: m,
            theirs: t,
          }) === 'mine'
        ? m
        : t;
    course = written(course, field.split('.'), value);
  }

  // Chapters: which stay, and their titles.
  const titles = new Map<string, { id: string; title: string }>();
  for (const key of union(M.chapterOrder, T.chapterOrder, B.chapterOrder)) {
    const b = B.chapters.get(key) ?? null;
    const m = M.chapters.get(key) ?? null;
    const t = T.chapters.get(key) ?? null;
    const conflict = (reason: ConflictReason) =>
      decide({
        key: rowKey(`chapter:${key}`),
        kind: 'chapter',
        id: ((m ?? t) as Chapter).id,
        reason,
        base: b,
        mine: m,
        theirs: t,
      });
    if (m && t) {
      const picked = pick3(b?.title, m.title, t.title);
      const title = picked
        ? (picked.value as string)
        : conflict('both') === 'mine'
          ? m.title
          : t.title;
      titles.set(key, { id: m.id, title });
    } else if (m || t) {
      const [kept, gone] = (m ? ['mine', 'theirs'] : ['theirs', 'mine']) as [Side, Side];
      const chapter = (m ?? t) as Chapter;
      // Added on one side, or removed on the other: removing wins unless the keeping side renamed
      // it or put new, changed or moved-in lessons in it. Then the Educator decides.
      const touched =
        b !== null &&
        (chapter.title !== b.title ||
          [...sides[kept].items.values()].some((at) => {
            if (at.chapterKey !== key) return false;
            const was = B.items.get(at.key);
            return !was || was.chapterKey !== key || has(sides[kept], at, 'changed');
          }));
      const stays =
        b === null ||
        (touched && conflict(gone === 'mine' ? 'removedInMine' : 'removedInTheirs') === kept);
      if (stays) titles.set(key, { id: chapter.id, title: chapter.title });
    }
  }

  // Lessons and Quizzes: which stay, with whose content, in which chapter.
  const kept = new Map<string, Kept>();
  for (const key of union(M.itemOrder, T.itemOrder, B.itemOrder)) {
    const b = B.items.get(key);
    const m = M.items.get(key);
    const t = T.items.get(key);
    const at = (m ?? t ?? b) as Location;
    const conflict = (reason: ConflictReason) =>
      decide({
        key: rowKey(key),
        kind: at.item.type,
        id: at.id,
        chapterId: at.chapterId,
        reason,
        base: b?.item ?? null,
        mine: m?.item ?? null,
        theirs: t?.item ?? null,
      });
    let from: Side | null;
    if (m && t) {
      const same =
        stable(m.item) === stable(t.item) &&
        stable(keysOf(mine.answers, m.item)) === stable(keysOf(theirs.answers, t.item));
      if (!b) from = same ? 'mine' : conflict('both');
      else if (!has(M, m, 'changed')) from = 'theirs';
      else if (!has(T, t, 'changed') || same) from = 'mine';
      else from = conflict('both');
    } else if (!b) from = m ? 'mine' : 'theirs';
    else if (!m && !t) from = null;
    else {
      const k: Side = m ? 'mine' : 'theirs';
      const r: Side = m ? 'theirs' : 'mine';
      const here = sides[k].items.get(key) as Location;
      if (!sides[r].chapters.has(b.chapterKey) && here.chapterKey === b.chapterKey)
        // Gone with its chapter on one side, still in it on the other: it follows the chapter.
        from = titles.has(b.chapterKey) ? k : null;
      else if (has(sides[k], here, 'changed'))
        from = conflict(r === 'mine' ? 'removedInMine' : 'removedInTheirs') === k ? k : null;
      else from = null;
    }
    if (from === null) continue;

    // Where it goes: where a side moved it (this session's place when both did), else where it is.
    const movedM = m !== undefined && has(M, m, 'moved');
    const movedT = t !== undefined && has(T, t, 'moved');
    const place = m && (movedM || !t) ? m : (t as Location);
    const other = place === m ? t : m;
    if (movedM && movedT && m.chapterKey !== t.chapterKey)
      orderKept.push({ list: 'items', chapterId: m.chapterId });
    // Its chapter is gone (removed by a choice): back to the other side's place, if that stays.
    const chapter = titles.has(place.chapterKey)
      ? place.chapterKey
      : other && titles.has(other.chapterKey)
        ? other.chapterKey
        : null;
    if (chapter === null) continue;
    const item = ((from === 'mine' ? m : t) as Location).item;
    kept.set(key, { item, from: from === 'mine' ? mine : theirs, chapter });
  }

  // Order: chapters, then the lessons and Quizzes inside each.
  const known = new Set(B.itemOrder);
  const chapterOrder = mergeOrder(
    B.chapterOrder,
    M.chapterOrder.filter((k) => titles.has(k)),
    T.chapterOrder.filter((k) => titles.has(k)),
    new Set(),
  );
  if (chapterOrder.kept) orderKept.push({ list: 'chapters' });
  const chapters: Chapter[] = chapterOrder.order.map((chapterKey) => {
    const { id, title } = titles.get(chapterKey) as { id: string; title: string };
    const inside = (side: Indexed) =>
      side.itemOrder.filter(
        (k) =>
          (side.items.get(k) as Location).chapterKey === chapterKey &&
          kept.get(k)?.chapter === chapterKey,
      );
    const items = mergeOrder(inside(B), inside(M), inside(T), known);
    if (items.kept && !orderKept.some((o) => o.list === 'items' && o.chapterId === id))
      orderKept.push({ list: 'items', chapterId: id });
    return { id, title, items: items.order.map((k) => (kept.get(k) as Kept).item) };
  });

  // Answer keys travel with their question: each Quiz's keys come from the copy its content did.
  const answers: AnswerKeys = {};
  for (const { item, from } of kept.values()) {
    const keys = from.answers[item.id];
    if (item.type === 'quiz' && keys) answers[item.id] = keys;
  }
  const changed = theirs.answersChanged === true || stable(answers) !== stable(theirs.answers);
  const working: WorkingCopy = {
    course: { ...(course as unknown as Course), chapters },
    answers,
    ...(changed ? { answersChanged: true as const } : {}),
  };
  return { conflicts, orderKept, working };
}

/**
 * Three-way merge of a session's working copy (`mine`) with the stored draft saved after the
 * session started (`theirs`), against the draft the session started from (`base`). Pure.
 *
 * - Course details and landing page fields merge one by one; chapters by id; lessons and Quizzes
 *   by type and id, whole (blocks and questions are not merged inside an item).
 * - Changed on one side only: taken from that side. Changed on both, differently: a conflict.
 *   Both made the same change, or both added the same thing: taken once.
 * - Removed on one side and changed on the other: a conflict. Removed on one side and moved or
 *   untouched on the other: removed. A chapter removed on one side takes along the items still in
 *   it on the other; it is a conflict, settled for the chapter and those items at once, when the
 *   other side renamed it or added, changed or moved in an item there.
 * - Order: a list reordered on one side takes that side's order; on both, this session's, and
 *   `orderKept` says so. An item moved on both sides goes where this session put it.
 * - Answer keys travel with their Quiz: whichever side's Quiz is kept brings its keys.
 */
export function mergeWorking(base: CourseCopy, mine: CourseCopy, theirs: CourseCopy): MergeResult {
  // Each conflict is first settled for this session so the rest can be worked out; `working` stays
  // null until the Educator has chosen.
  const { conflicts, orderKept, working } = merge(base, mine, theirs, () => 'mine');
  return {
    base,
    mine,
    theirs,
    conflicts,
    orderKept,
    working: conflicts.length > 0 ? null : working,
  };
}

/**
 * The merged working copy with every conflict settled as chosen: `mine` keeps this session's
 * version, `theirs` the stored draft's. Throws when a conflict has no choice: nothing is merged
 * silently. The result, like any working copy, still goes through the Review's checks before Save.
 */
export function resolveConflicts(result: MergeResult, choices: ConflictChoices): WorkingCopy {
  const open = result.conflicts.find((c) => choices[c.key] === undefined);
  if (open) throw new Error(`No choice was made for the conflict "${open.key}".`);
  return merge(result.base, result.mine, result.theirs, (c) => choices[c.key] as Side).working;
}
