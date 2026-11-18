import { diffLines, diffWordsWithSpace } from 'diff';
import type { Change } from 'diff';
import type { Block, BlockType, Chapter, Course, Item, Lesson, Question, Quiz } from './course';
import type { AnswerKeys } from './draft';

/*
 * What a Desktop Studio session changed in a course, one row per thing an Educator thinks of as a
 * unit: the Review screen reads it, and so does each turn's change count
 * (`.plan/22-desktop-studio.md`, "Review: the whole session at once").
 *
 * Everything is matched by id (items, blocks, questions, options), or by exact text for lists
 * without ids (outcomes, a check block's options). "Moved" is decided with a longest common
 * subsequence, so one insertion or deletion does not mark everything after it as moved.
 */

/** A course and its answer keys: the base a session started from, or its working copy (Studio's `Working`). */
export interface CourseCopy {
  course: Course;
  answers: AnswerKeys;
  /** Carried for the shape only: whether keys changed is worked out from `answers` themselves. */
  answersChanged?: true;
}

/** One run of a text difference: kept, added or removed. */
export type DiffOp = 'same' | 'added' | 'removed';

/**
 * A run of text in a difference. Joining the parts that are not `removed` gives the text after;
 * joining those that are not `added` gives the text before.
 */
export interface DiffPart {
  op: DiffOp;
  text: string;
}

const toParts = (changes: Change[]): DiffPart[] =>
  changes.map((c) => ({ op: c.added ? 'added' : c.removed ? 'removed' : 'same', text: c.value }));

/** Word-level difference for prose (titles, captions, markdown). Spaces and line breaks are kept. */
export function wordDiff(before: string, after: string): DiffPart[] {
  return toParts(diffWordsWithSpace(before, after));
}

/** Line-level difference for code: one part per run of kept, added or removed lines. */
export function lineDiff(before: string, after: string): DiffPart[] {
  return toParts(diffLines(before, after));
}

/** A field's value as the Review shows it; null means absent (not set). */
export type FieldValue = string | number | boolean | null;

/**
 * One field that differs, as before → after. A field holding an object (the cover image, an
 * uploaded file) is compared whole but shown as a short label: its `url`, else its upload `path`.
 * The two labels can then be equal (a new BlurHash for the same file): the field still changed.
 */
export interface FieldChange {
  /** Dotted path from the row or entry: `title`, `rules.passMark`, `cover.image`, `md`, `upload`. */
  field: string;
  before: FieldValue;
  after: FieldValue;
  /** Word difference, on prose fields (titles, summaries, captions, alt, labels, markdown, prompts). */
  words?: DiffPart[];
  /** Line difference, on code (a code block's `code`, a question's `code`). */
  lines?: DiffPart[];
}

/** What happened to a row. `renamed` is for chapters only (the title changed). */
export type RowStatus = 'added' | 'changed' | 'removed' | 'moved' | 'renamed';

/** Where a moved lesson or Quiz was and is: chapter ids and indexes within those chapters. */
export interface Move {
  fromChapterId: string;
  fromIndex: number;
  toChapterId: string;
  toIndex: number;
}

/**
 * An option, outcome, block or question inside a row. Unchanged entries are kept, with no
 * statuses, so the Review can say "3 unchanged blocks". Entries without ids (outcomes, a check
 * block's options) are named `#<index in the working copy>`, or `removed#<index in the base>`
 * when they are gone.
 */
export interface ListEntryChange {
  id: string;
  /** Empty when unchanged. `added` and `removed` come alone; `changed` and `moved` can come together. */
  statuses: ('added' | 'changed' | 'removed' | 'moved')[];
  /** The whole entry before, or null when it was added. */
  before: FieldValue | object | null;
  /** The whole entry after, or null when it was removed. */
  after: FieldValue | object | null;
  fields: FieldChange[];
}

/**
 * A changed correct answer, called out on its own, never folded into a field. Ids are the entry ids
 * of `options` beside it: option ids for a Quiz question, `#<index>` for a check block.
 */
export interface AnswerChange {
  before: string[];
  after: string[];
}

/** A block in a lesson row. A check block also carries its options and its correct answer. */
export interface BlockChange extends ListEntryChange {
  type: BlockType;
  options?: ListEntryChange[];
  answer?: AnswerChange;
}

/** A question in a Quiz row, with its options by id and, when its key differs, its answer. */
export interface QuestionChange extends ListEntryChange {
  options: ListEntryChange[];
  answer?: AnswerChange;
}

/** One row of the Review list. Lesson and Quiz rows name their chapter so the list can group them. */
export type ChangeRow =
  | { kind: 'course'; id: 'course'; statuses: RowStatus[]; fields: FieldChange[] }
  | {
      kind: 'landing';
      id: 'landing';
      statuses: RowStatus[];
      fields: FieldChange[];
      outcomes: ListEntryChange[];
    }
  | {
      kind: 'chapter';
      id: string;
      statuses: RowStatus[];
      before: Chapter | null;
      after: Chapter | null;
      fields: FieldChange[];
      move?: { fromIndex: number; toIndex: number };
    }
  | {
      kind: 'lesson';
      id: string;
      chapterId: string;
      statuses: RowStatus[];
      before: Lesson | null;
      after: Lesson | null;
      fields: FieldChange[];
      blocks: BlockChange[];
      move?: Move;
    }
  | {
      kind: 'quiz';
      id: string;
      chapterId: string;
      statuses: RowStatus[];
      before: Quiz | null;
      after: Quiz | null;
      fields: FieldChange[];
      questions: QuestionChange[];
      move?: Move;
    };

/** Everything a session changed, in display order. */
export interface CourseChanges {
  /** Only rows with at least one status, in the order the Review lists them. */
  rows: ChangeRow[];
  /** `rows.length`: the header's "11 changes". */
  count: number;
  /** Every question, present before and after, whose answer key differs. */
  answerChanges: { quizId: string; questionId: string }[];
}

// ─── Fields ──────────────────────────────────────────────────────────────────────────────────────

type FieldKind = 'plain' | 'words' | 'lines';
type FieldSpec = readonly (readonly [field: string, kind: FieldKind])[];

/** JSON with object keys sorted, so two equal values always compare equal (as in `draft.ts`). */
const stable = (value: unknown): string =>
  JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );

const read = (value: unknown, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>((o, k) => (o as Record<string, unknown> | null | undefined)?.[k], value);

function shown(value: unknown): FieldValue {
  if (value == null) return null;
  if (typeof value !== 'object') return value as string | number | boolean;
  const o = value as { url?: unknown; path?: unknown };
  return typeof o.url === 'string' ? o.url : typeof o.path === 'string' ? o.path : stable(value);
}

const prose = (value: unknown) => (typeof value === 'string' ? value : '');

/** The fields in `spec` that differ between two versions of the same thing (either may be null). */
function fieldChanges(spec: FieldSpec, before: unknown, after: unknown): FieldChange[] {
  const out: FieldChange[] = [];
  for (const [field, kind] of spec) {
    const b = read(before, field);
    const a = read(after, field);
    if (stable(b) === stable(a)) continue;
    const change: FieldChange = { field, before: shown(b), after: shown(a) };
    if (kind === 'words') change.words = wordDiff(prose(b), prose(a));
    if (kind === 'lines') change.lines = lineDiff(prose(b), prose(a));
    out.push(change);
  }
  return out;
}

const COURSE_FIELDS: FieldSpec = [
  ['title', 'words'],
  ['summary', 'words'],
  ['level', 'plain'],
  ['cover.theme', 'plain'],
  ['cover.glyph', 'plain'],
  ['cover.image', 'plain'],
  ['rules.sequential', 'plain'],
  ['rules.passMark', 'plain'],
  ['rules.certificate', 'plain'],
  ['rules.requireVideoWatch', 'plain'],
  ['certificate.title', 'words'],
];
const LANDING_FIELDS: FieldSpec = [['description', 'words']];
const TITLE_FIELDS: FieldSpec = [['title', 'words']];
const TEXT_FIELDS: FieldSpec = [['text', 'words']];
const LESSON_FIELDS: FieldSpec = [
  ['title', 'words'],
  ['minutes', 'plain'],
  ['layout', 'plain'],
  ['completeWhen', 'plain'],
  ['kindLabel', 'words'],
];
const QUIZ_FIELDS: FieldSpec = [
  ['title', 'words'],
  ['passMark', 'plain'],
  ['questionsShown', 'plain'],
  ['shuffleOptions', 'plain'],
  ['cooldownMinutes', 'plain'],
  ['revealAnswers', 'plain'],
  ['blocksNext', 'plain'],
];
const QUESTION_FIELDS: FieldSpec = [
  ['kind', 'plain'],
  ['prompt', 'words'],
  ['code', 'lines'],
  ['explanation', 'words'],
  ['reviewItemId', 'plain'],
];
/** A check block's `options` and `correct` are compared as a list and an answer, not as fields. */
const BLOCK_FIELDS: Record<BlockType, FieldSpec> = {
  markdown: [['md', 'words']],
  callout: [
    ['tone', 'plain'],
    ['title', 'words'],
    ['md', 'words'],
  ],
  code: [
    ['lang', 'plain'],
    ['file', 'plain'],
    ['code', 'lines'],
    ['copy', 'plain'],
    ['terminal', 'plain'],
    ['highlight', 'plain'],
  ],
  video: [
    ['provider', 'plain'],
    ['url', 'plain'],
    ['captions', 'plain'],
    ['title', 'words'],
    ['caption', 'words'],
    ['durationSec', 'plain'],
  ],
  image: [
    ['url', 'plain'],
    ['alt', 'words'],
    ['caption', 'words'],
    ['layout', 'plain'],
    ['zoom', 'plain'],
    ['border', 'plain'],
    ['width', 'plain'],
    ['height', 'plain'],
    ['upload', 'plain'],
  ],
  embed: [
    ['url', 'plain'],
    ['title', 'words'],
  ],
  file: [
    ['url', 'plain'],
    ['label', 'words'],
    ['upload', 'plain'],
  ],
  check: [
    ['prompt', 'words'],
    ['explanation', 'words'],
  ],
};

// ─── Aligning two lists ──────────────────────────────────────────────────────────────────────────

/** One entry of two aligned lists. `value` is `after`, or `before` when the entry was removed. */
interface Paired<T> {
  key: string;
  value: T;
  before: T | null;
  after: T | null;
  /** Index in the base list, -1 when added. */
  beforeIndex: number;
  /** Index in the working list, -1 when removed. */
  afterIndex: number;
  /** On both sides, but out of the order the two sides share. */
  moved: boolean;
}

/** Index pairs of one longest common subsequence of `a` and `b`; ties keep the earlier `a` entry. */
function lcs(a: readonly string[], b: readonly string[]): [number, number][] {
  const w = b.length + 1;
  const t = new Array<number>((a.length + 1) * w).fill(0);
  const at = (i: number, j: number) => t[i * w + j] as number;
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      t[i * w + j] = a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
  const out: [number, number][] = [];
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) out.push([i++, j++]);
    else if (at(i + 1, j) >= at(i, j + 1)) i++;
    else j++;
  }
  return out;
}

/**
 * Aligns two lists by key (the id by default). Entries on both sides are moved when they fall
 * outside the longest common subsequence of the shared keys' order. Output follows the working
 * list; each removed entry comes right after the nearest entry before it in the base that is still
 * there and not moved (or first, when there is none), several in their base order.
 */
function alignById<T extends { id: string }>(
  before: readonly T[],
  after: readonly T[],
  key: (entry: T) => string = (entry) => entry.id,
): Paired<T>[] {
  const was = new Map(before.map((entry, index) => [key(entry), { entry, index }]));
  const now = new Set(after.map(key));
  const sharedBefore = before.map(key).filter((k) => now.has(k));
  const sharedAfter = after.map(key).filter((k) => was.has(k));
  const kept = new Set(lcs(sharedBefore, sharedAfter).map(([i]) => sharedBefore[i]));

  const removedAfter = new Map<string | null, Paired<T>[]>();
  let anchor: string | null = null;
  for (const [index, entry] of before.entries()) {
    const k = key(entry);
    if (kept.has(k)) anchor = k;
    else if (!now.has(k)) {
      const group = removedAfter.get(anchor) ?? [];
      group.push({
        key: k,
        value: entry,
        before: entry,
        after: null,
        beforeIndex: index,
        afterIndex: -1,
        moved: false,
      });
      removedAfter.set(anchor, group);
    }
  }

  const out = [...(removedAfter.get(null) ?? [])];
  for (const [index, entry] of after.entries()) {
    const k = key(entry);
    const old = was.get(k);
    out.push({
      key: k,
      value: entry,
      before: old ? old.entry : null,
      after: entry,
      beforeIndex: old ? old.index : -1,
      afterIndex: index,
      moved: old !== undefined && !kept.has(k),
    });
    out.push(...(removedAfter.get(k) ?? []));
  }
  return out;
}

/**
 * Aligns two lists of strings that have no ids: exact text matches along a longest common
 * subsequence stay put; between two matches, leftover removed and added strings pair up in order as
 * rewordings, and any extra are removed or added. Text never counts as moved.
 */
function alignByText(before: readonly string[], after: readonly string[]): Paired<string>[] {
  const pair = (bi: number, aj: number): Paired<string> => {
    const b = before[bi] ?? null;
    const a = after[aj] ?? null;
    return {
      key: aj >= 0 ? `#${aj}` : `removed#${bi}`,
      value: a ?? (b as string),
      before: b,
      after: a,
      beforeIndex: bi,
      afterIndex: aj,
      moved: false,
    };
  };
  const out: Paired<string>[] = [];
  let i = 0;
  let j = 0;
  for (const [mi, mj] of [...lcs(before, after), [before.length, after.length] as const]) {
    for (let k = 0; k < Math.max(mi - i, mj - j); k++)
      out.push(pair(i + k < mi ? i + k : -1, j + k < mj ? j + k : -1));
    if (mi < before.length) out.push(pair(mi, mj));
    i = mi + 1;
    j = mj + 1;
  }
  return out;
}

// ─── Entries ─────────────────────────────────────────────────────────────────────────────────────

/** Added and removed come alone; otherwise the edit (if any) then `moved` (if moved). */
function statusesOf<E extends string>(
  p: { before: unknown; after: unknown },
  edited: boolean,
  edit: E,
  moved: boolean,
): ('added' | 'removed' | 'moved' | E)[] {
  if (p.before === null) return ['added'];
  if (p.after === null) return ['removed'];
  return [...(edited ? [edit] : []), ...(moved ? (['moved'] as const) : [])];
}

function entry<T extends string | object>(
  p: Paired<T>,
  fields: FieldChange[],
  innerChanged: boolean,
): ListEntryChange {
  return {
    id: p.key,
    statuses: statusesOf(p, fields.length > 0 || innerChanged, 'changed', p.moved),
    before: p.before,
    after: p.after,
    fields,
  };
}

const touched = (entries: readonly { statuses: readonly string[] }[]) =>
  entries.some((e) => e.statuses.length > 0);

const sameSet = (a: readonly string[], b: readonly string[]) =>
  stable([...a].sort()) === stable([...b].sort());

function textEntries(pairs: readonly Paired<string>[]): ListEntryChange[] {
  return pairs.map((p) =>
    entry(p, fieldChanges(TEXT_FIELDS, { text: p.before }, { text: p.after }), false),
  );
}

/** A check block's right answer, as entry ids: the base's right option, followed through rewording. */
function checkAnswer(
  pairs: readonly Paired<string>[],
  before: number | undefined,
  after: number | undefined,
): AnswerChange | undefined {
  const ids = (pick: (p: Paired<string>) => boolean) => pairs.filter(pick).map((p) => p.key);
  const was = ids((p) => p.beforeIndex === before);
  const now = ids((p) => p.afterIndex === after);
  return sameSet(was, now) ? undefined : { before: was, after: now };
}

/** A block type this version does not know (a malformed working copy) has no fields to compare. */
const specOf = (type: string): FieldSpec => BLOCK_FIELDS[type as BlockType] ?? [];

/** Field spec for a block; when its type changed under the same id, `type` plus both types' fields. */
function blockSpec(before: Block | null, after: Block | null, value: Block): FieldSpec {
  if (!before || !after || before.type === after.type) return specOf(value.type);
  const first = specOf(before.type);
  const extra = specOf(after.type).filter(([f]) => !first.some(([g]) => g === f));
  return [['type', 'plain'], ...first, ...extra];
}

const asCheck = (b: Block | null) => (b?.type === 'check' ? b : null);

function blockEntries(before: readonly Block[], after: readonly Block[]): BlockChange[] {
  return alignById(before, after).map((p) => {
    const fields = fieldChanges(blockSpec(p.before, p.after, p.value), p.before, p.after);
    const was = asCheck(p.before);
    const now = asCheck(p.after);
    if (!was && !now) return { ...entry(p, fields, false), type: p.value.type };
    const pairs = alignByText(was?.options ?? [], now?.options ?? []);
    const options = textEntries(pairs);
    const answer = checkAnswer(pairs, was?.correct, now?.correct);
    return {
      ...entry(p, fields, touched(options) || answer !== undefined),
      type: p.value.type,
      options,
      ...(answer ? { answer } : {}),
    };
  });
}

/** A question's key in one copy; a question missing on that side has none. */
const keyOf = (keys: AnswerKeys, quizId: string, q: Question | null): string[] =>
  q ? (keys[quizId]?.[q.id] ?? []) : [];

function questionEntries(
  quizId: string,
  before: readonly Question[],
  after: readonly Question[],
  baseKeys: AnswerKeys,
  workKeys: AnswerKeys,
): QuestionChange[] {
  return alignById(before, after).map((p) => {
    const fields = fieldChanges(QUESTION_FIELDS, p.before, p.after);
    const options = alignById(p.before?.options ?? [], p.after?.options ?? []).map((o) =>
      entry(o, fieldChanges(TEXT_FIELDS, o.before, o.after), false),
    );
    const was = keyOf(baseKeys, quizId, p.before);
    const now = keyOf(workKeys, quizId, p.after);
    const answer = sameSet(was, now) ? undefined : { before: was, after: now };
    return {
      ...entry(p, fields, touched(options) || answer !== undefined),
      options,
      ...(answer ? { answer } : {}),
    };
  });
}

// ─── Rows ────────────────────────────────────────────────────────────────────────────────────────

function courseRow(was: Course | null, now: Course): ChangeRow {
  const fields = fieldChanges(COURSE_FIELDS, was, now);
  const statuses = statusesOf({ before: was, after: now }, fields.length > 0, 'changed', false);
  return { kind: 'course', id: 'course', statuses, fields };
}

function landingRow(was: Course | null, now: Course): ChangeRow {
  const fields = fieldChanges(LANDING_FIELDS, was, now);
  const outcomes = textEntries(alignByText(was?.outcomes ?? [], now.outcomes));
  const edited = fields.length > 0 || touched(outcomes);
  const statuses = statusesOf({ before: was, after: now }, edited, 'changed', false);
  return { kind: 'landing', id: 'landing', statuses, fields, outcomes };
}

function chapterRow(p: Paired<Chapter>): ChangeRow {
  const fields = fieldChanges(TITLE_FIELDS, p.before, p.after);
  return {
    kind: 'chapter',
    id: p.key,
    statuses: statusesOf(p, fields.length > 0, 'renamed', p.moved),
    before: p.before,
    after: p.after,
    fields,
    ...(p.moved ? { move: { fromIndex: p.beforeIndex, toIndex: p.afterIndex } } : {}),
  };
}

const asLesson = (i: Item | null) => (i?.type === 'lesson' ? i : null);
const asQuiz = (i: Item | null) => (i?.type === 'quiz' ? i : null);

interface ItemContext {
  chapterId: string;
  move: Move | undefined;
  baseKeys: AnswerKeys;
  workKeys: AnswerKeys;
}

function lessonRow(before: Lesson | null, after: Lesson | null, id: string, cx: ItemContext) {
  const fields = fieldChanges(LESSON_FIELDS, before, after);
  const blocks = blockEntries(before?.blocks ?? [], after?.blocks ?? []);
  const edited = fields.length > 0 || touched(blocks);
  return {
    kind: 'lesson' as const,
    id,
    chapterId: cx.chapterId,
    statuses: statusesOf({ before, after }, edited, 'changed', cx.move !== undefined),
    before,
    after,
    fields,
    blocks,
    ...(cx.move ? { move: cx.move } : {}),
  };
}

function quizRow(before: Quiz | null, after: Quiz | null, id: string, cx: ItemContext) {
  const fields = fieldChanges(QUIZ_FIELDS, before, after);
  const questions = questionEntries(
    id,
    before?.questions ?? [],
    after?.questions ?? [],
    cx.baseKeys,
    cx.workKeys,
  );
  const edited = fields.length > 0 || touched(questions);
  return {
    kind: 'quiz' as const,
    id,
    chapterId: cx.chapterId,
    statuses: statusesOf({ before, after }, edited, 'changed', cx.move !== undefined),
    before,
    after,
    fields,
    questions,
    ...(cx.move ? { move: cx.move } : {}),
  };
}

interface Location {
  chapterId: string;
  index: number;
  item: Item;
}

/**
 * Items are matched by type and id, so a lesson turned into a Quiz under the same id reads as one
 * removed and one added: their rows share the id and differ in `kind`.
 */
const itemKey = (item: Item) => `${item.type}:${item.id}`;

function locate(course: Course | null): Map<string, Location> {
  return new Map(
    (course?.chapters ?? []).flatMap((chapter) =>
      chapter.items.map((item, index) => [itemKey(item), { chapterId: chapter.id, index, item }]),
    ),
  );
}

/** Moved: in another chapter in the base, or out of the shared order within the same chapter. */
function moveOf(origin: Location | undefined, p: Paired<Item>, chapterId: string) {
  if (!origin || p.after === null || (origin.chapterId === chapterId && !p.moved)) return undefined;
  return {
    fromChapterId: origin.chapterId,
    fromIndex: origin.index,
    toChapterId: chapterId,
    toIndex: p.afterIndex,
  };
}

/**
 * Chapter rows and their item rows, in the working copy's order. Within a chapter, the base list
 * holds only the items that stay in it or are gone from the course; items that came from another
 * chapter are matched with their old place (moved). A removed chapter is followed by its removed
 * items.
 */
function chapterRows(
  was: Course | null,
  now: Course,
  baseKeys: AnswerKeys,
  workKeys: AnswerKeys,
): ChangeRow[] {
  const from = locate(was);
  const to = locate(now);
  const rows: ChangeRow[] = [];
  for (const chapter of alignById(was?.chapters ?? [], now.chapters)) {
    rows.push(chapterRow(chapter));
    const stays = (chapter.before?.items ?? []).filter(
      (item) => (to.get(itemKey(item))?.chapterId ?? chapter.key) === chapter.key,
    );
    for (const p of alignById(stays, chapter.after?.items ?? [], itemKey)) {
      const origin = from.get(p.key);
      const before = origin ? origin.item : null;
      const cx = {
        chapterId: chapter.key,
        move: moveOf(origin, p, chapter.key),
        baseKeys,
        workKeys,
      };
      rows.push(
        p.value.type === 'lesson'
          ? lessonRow(asLesson(before), asLesson(p.after), p.value.id, cx)
          : quizRow(asQuiz(before), asQuiz(p.after), p.value.id, cx),
      );
    }
  }
  return rows;
}

/**
 * Every change a session made, row by row, comparing `work` with `base` (null for a course the
 * session created: every row is then added). Rows come in the Review's order: Course details,
 * Landing page, then each chapter in the working copy's order followed by its lessons and Quizzes.
 * A removed chapter or item is listed where it used to be: right after the nearest entry before it
 * in the base that is still in the same list and not moved, or first when there is none. Only rows
 * with a status are returned; changed answer keys are also listed in `answerChanges`.
 */
export function courseChanges(base: CourseCopy | null, work: CourseCopy): CourseChanges {
  const was = base ? base.course : null;
  const rows = [
    courseRow(was, work.course),
    landingRow(was, work.course),
    ...chapterRows(was, work.course, base ? base.answers : {}, work.answers),
  ].filter((row) => row.statuses.length > 0);
  const answerChanges = rows.flatMap((row) =>
    row.kind === 'quiz'
      ? row.questions
          .filter((q) => q.answer && q.before !== null && q.after !== null)
          .map((q) => ({ quizId: row.id, questionId: q.id }))
      : [],
  );
  return { rows, count: rows.length, answerChanges };
}
